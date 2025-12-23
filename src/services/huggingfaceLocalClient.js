const localUrl = process.env.HUGGINGFACE_LOCAL_URL; // e.g., http://localhost:8080/generate (TGI)

if (!localUrl) {
  console.warn(
    "HUGGINGFACE_LOCAL_URL is not set; local Hugging Face completion is disabled."
  );
}

async function runHuggingFaceLocalCompletion(messages, parameters = {}) {
  if (!localUrl) throw new Error("Hugging Face local endpoint not configured");

  // Join messages into a single prompt with role markers.
  const prompt = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  // Text Generation Inference compatible payload
  const body = {
    inputs: prompt,
    parameters: {
      temperature: parameters.temperature ?? 0.2,
      max_new_tokens: parameters.max_new_tokens ?? 200,
      num_beams: parameters.num_beams ?? 1,
    },
  };

  const res = await fetch(localUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Local HF completion failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  // Expect {generated_text:""} or array with generated_text
  const out =
    data.generated_text ||
    (Array.isArray(data) ? data[0]?.generated_text : "") ||
    "";
  return String(out).trim();
}

module.exports = { runHuggingFaceLocalCompletion };

