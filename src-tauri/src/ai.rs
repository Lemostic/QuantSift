//! AI backend commands: LLM chat completion (OpenAI-compatible) and web
//! search (Tavily). Provider keys travel from the frontend per call and are
//! never persisted in Rust.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmProviderConfig {
    pub id: String,
    pub label: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub enabled: bool,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmUsage {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmChatResult {
    pub content: String,
    pub model: String,
    pub usage: Option<LlmUsage>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
    model: Option<String>,
    usage: Option<LlmUsageJson>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LlmUsageJson {
    prompt_tokens: u64,
    completion_tokens: u64,
}

#[tauri::command]
pub async fn llm_chat_completion(
    provider: LlmProviderConfig,
    messages: Vec<LlmMessage>,
) -> Result<LlmChatResult, String> {
    let client = crate::market::client::build_client().map_err(|err| err.to_string())?;
    let endpoint = provider
        .base_url
        .trim_end_matches('/')
        .to_string()
        + "/chat/completions";
    let body = serde_json::json!({
        "model": provider.model,
        "messages": messages
            .iter()
            .map(|message| serde_json::json!({ "role": message.role, "content": message.content }))
            .collect::<Vec<_>>(),
        "temperature": 0.4,
    });
    let response = client
        .post(&endpoint)
        .bearer_auth(provider.api_key)
        .header("Content-Type", "application/json")
        .timeout(std::time::Duration::from_secs(90))
        .json(&body)
        .send()
        .await
        .map_err(|err| format!("网络请求失败: {err}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|err| format!("网络请求失败: {err}"))?;
    if !status.is_success() {
        return Err(format!(
            "模型接口错误: HTTP {status} — {}",
            text.chars().take(300).collect::<String>()
        ));
    }
    let parsed: ChatCompletionResponse = serde_json::from_str(&text)
        .map_err(|err| format!("模型响应解析失败: {err}"))?;
    let content = parsed
        .choices
        .first()
        .and_then(|choice| choice.message.content.clone())
        .ok_or_else(|| "模型返回空内容".to_string())?;
    Ok(LlmChatResult {
        content,
        model: parsed.model.unwrap_or(provider.model),
        usage: parsed.usage.map(|usage| LlmUsage {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
        }),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_chat_completion_response() {
        let body = r#"{
          "id": "chatcmpl-1",
          "object": "chat.completion",
          "model": "deepseek-chat",
          "choices": [
            { "index": 0, "message": { "role": "assistant", "content": "信号: BUY\n建议逢低分批建仓" }, "finish_reason": "stop" }
          ],
          "usage": { "prompt_tokens": 1200, "completion_tokens": 220 }
        }"#;
        let parsed: ChatCompletionResponse = serde_json::from_str(body).expect("valid body");
        let content = parsed
            .choices
            .first()
            .and_then(|choice| choice.message.content.clone())
            .expect("content");
        assert!(content.contains("BUY"));
        assert_eq!(parsed.model.as_deref(), Some("deepseek-chat"));
        assert_eq!(parsed.usage.unwrap().prompt_tokens, 1200);
    }

    #[test]
    fn rejects_empty_choice_list() {
        let body = r#"{"choices": [], "model": "x"}"#;
        let parsed: ChatCompletionResponse = serde_json::from_str(body).expect("parses");
        assert!(parsed.choices.is_empty());
    }
}
