const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');

class OpenAIAssistantService {
  constructor({ apiKey = process.env.OPENAI_API_KEY } = {}) {
    if (!apiKey) throw new Error('OPENAI_API_KEY is required for OpenAIAssistantService');
    const OpenAI = require('openai');

    // Use native fetch if available; fallback to node-fetch for REST-only calls
    const baseFetch = (globalThis && globalThis.fetch) ? globalThis.fetch.bind(globalThis) : require('node-fetch');

    // IMPORTANT: Do NOT wrap SDK fetch globally; it can break multipart streams.
    this.openai = new OpenAI({ apiKey });
    this.apiKey = apiKey;
    this.fetch = baseFetch;

    this.personalitiesPath = path.join(__dirname, '../../data/ai-personalities.json');
  }

  // ===== Legacy personality-backed helpers (will be removed) =====
  async _loadPersonalities() {
    try {
      const data = await fs.readFile(this.personalitiesPath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }

  async _savePersonalities(list) {
    await fs.writeFile(this.personalitiesPath, JSON.stringify(list, null, 2));
  }

  async _findPersonality(personalityId) {
    const list = await this._loadPersonalities();
    const idx = list.findIndex(p => p.id === personalityId);
    if (idx === -1) {
      throw new Error('Personality not found');
    }
    return { list, idx, personality: list[idx] };
  }

  async ensureVectorStore(personalityId) {
    const { list, idx, personality } = await this._findPersonality(personalityId);

    if (personality.vectorStoreId) {
      try {
        await this.openai.beta.vectorStores.retrieve(personality.vectorStoreId);
        return personality.vectorStoreId;
      } catch (e) {
        // recreate if missing
      }
    }

    const vs = await this.openai.beta.vectorStores.create({
      name: `${personality.name || personality.id} Knowledge Base`
    });

    list[idx] = {
      ...personality,
      vectorStoreId: vs.id,
      lastModified: new Date().toISOString()
    };
    await this._savePersonalities(list);
    return vs.id;
  }

  async ensureAssistantForPersonality(personalityId) {
    const { list, idx, personality } = await this._findPersonality(personalityId);

    const instructions = personality.systemPrompt || 'You are a helpful assistant.';
    const model = personality.model || 'gpt-4o-mini';

    // Ensure vector store (for retrieval)
    const vectorStoreId = await this.ensureVectorStore(personalityId);

    if (personality.assistantId) {
      // Use REST API with v2 header
      const resp = await this.fetch(`https://api.openai.com/v1/assistants/${personality.assistantId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify({
          name: personality.name || personality.id,
          model,
          instructions,
          tools: [{ type: 'file_search' }],
          tool_resources: {
            file_search: { vector_store_ids: [vectorStoreId] }
          }
        })
      });
      const updated = await resp.json();
      if (!resp.ok) throw new Error(updated?.error?.message || `Assistant update failed (${resp.status})`);

      list[idx] = {
        ...personality,
        assistantId: updated.id,
        vectorStoreId,
        lastModified: new Date().toISOString()
      };
      await this._savePersonalities(list);
      return { assistantId: updated.id, vectorStoreId };
    }

    // Use REST API with v2 header
    const resp = await this.fetch('https://api.openai.com/v1/assistants', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({
        name: personality.name || personality.id,
        model,
        instructions,
        tools: [{ type: 'file_search' }],
        tool_resources: {
          file_search: { vector_store_ids: [vectorStoreId] }
        }
      })
    });
    const assistant = await resp.json();
    if (!resp.ok) throw new Error(assistant?.error?.message || `Assistant create failed (${resp.status})`);

    list[idx] = {
      ...personality,
      assistantId: assistant.id,
      vectorStoreId,
      lastModified: new Date().toISOString()
    };
    await this._savePersonalities(list);

    return { assistantId: assistant.id, vectorStoreId };
  }

  async uploadDocuments(personalityId, filePaths) {
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      throw new Error('No files provided');
    }

    const { assistantId, vectorStoreId } = await this.ensureAssistantForPersonality(personalityId);

    const uploaded = [];
    for (const fp of filePaths) {
      const stat = await fs.stat(fp);
      if (stat.size > 20 * 1024 * 1024) {
        throw new Error(`File too large: ${path.basename(fp)}`);
      }

      const stream = fssync.createReadStream(fp);
      const file = await this.openai.files.create({ file: stream, purpose: 'assistants' });

      await this.openai.beta.vectorStores.files.create(vectorStoreId, { file_id: file.id });

      uploaded.push({ fileId: file.id, filename: path.basename(fp) });
    }

    const { list, idx, personality } = await this._findPersonality(personalityId);
    const existingFiles = personality.files || [];
    list[idx] = {
      ...personality,
      assistantId,
      vectorStoreId,
      files: [
        ...existingFiles,
        ...uploaded.map(u => ({ ...u, uploadedAt: new Date().toISOString() }))
      ],
      lastModified: new Date().toISOString()
    };
    await this._savePersonalities(list);

    return { assistantId, vectorStoreId, uploaded };
  }

  async runAssistantMessage(personalityId, userMessage, { timeoutMs = 30000 } = {}) {
    if (!userMessage || !userMessage.trim()) throw new Error('Message is required');

    const { assistantId } = await this.ensureAssistantForPersonality(personalityId);

    // Create thread using REST API with v2 header
    const threadResp = await this.fetch('https://api.openai.com/v1/threads', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({})
    });
    const thread = await threadResp.json();
    if (!threadResp.ok) throw new Error(thread?.error?.message || `Thread create failed (${threadResp.status})`);

    // Add message using REST API
    const msgResp = await this.fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({
        role: 'user',
        content: userMessage
      })
    });
    const message = await msgResp.json();
    if (!msgResp.ok) throw new Error(message?.error?.message || `Message create failed (${msgResp.status})`);

    // Create run using REST API
    const runResp = await this.fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({
        assistant_id: assistantId
      })
    });
    const run = await runResp.json();
    if (!runResp.ok) throw new Error(run?.error?.message || `Run create failed (${runResp.status})`);

    const start = Date.now();
    let status = 'queued';
    while (Date.now() - start < timeoutMs) {
      // Check run status using REST API
      const statusResp = await this.fetch(`https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      });
      const current = await statusResp.json();
      if (!statusResp.ok) throw new Error(current?.error?.message || `Run status check failed (${statusResp.status})`);

      status = current.status;
      if (status === 'completed') break;
      if (status === 'failed' || status === 'expired' || status === 'cancelled') {
        throw new Error(`Assistant run ${status}`);
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    if (status !== 'completed') {
      throw new Error('Assistant run timed out');
    }

    // Get messages using REST API
    const messagesResp = await this.fetch(`https://api.openai.com/v1/threads/${thread.id}/messages?limit=10`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    });
    const list = await messagesResp.json();
    if (!messagesResp.ok) throw new Error(list?.error?.message || `Messages list failed (${messagesResp.status})`);

    const messages = list.data || [];
    const firstAssistant = messages.find(m => m.role === 'assistant');
    let text = '';
    if (firstAssistant && firstAssistant.content && firstAssistant.content.length) {
      const parts = firstAssistant.content.filter(p => p.type === 'text');
      if (parts.length) text = parts.map(p => p.text.value).join('\n');
    }

    return { threadId: thread.id, runId: run.id, text };
  }

  // ===== New: Direct Assistant CRUD (no personality layer) =====
  async listAssistants({ limit = 100 } = {}) {
    // Use REST API directly with v2 header to avoid deprecation warnings
    const url = `https://api.openai.com/v1/assistants?limit=${encodeURIComponent(limit)}`;
    const resp = await this.fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message || `Assistants list failed (${resp.status})`);
    return data?.data || [];
  }

  async getAssistant(assistantId) {
    // Use REST API directly with v2 header to avoid deprecation warnings
    const resp = await this.fetch(`https://api.openai.com/v1/assistants/${assistantId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message || `Assistant get failed (${resp.status})`);
    return data;
  }

  async createAssistant({ name, model = 'gpt-4o-mini', instructions = '', description = '', tools = [] } = {}) {
    const toolSpecs = (tools || []).map(t => (typeof t === 'string' ? { type: t } : t));
    const payload = { name, model, instructions, tools: toolSpecs };
    if (description) payload.description = description;

    // Use REST API directly with v2 header to avoid deprecation warnings
    const resp = await this.fetch('https://api.openai.com/v1/assistants', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message || `Assistant create failed (${resp.status})`);
    return data;
  }

  async updateAssistant(assistantId, { name, model, instructions, description, tools, tool_resources } = {}) {
    const payload = {};
    if (name !== undefined) payload.name = name;
    if (model !== undefined) payload.model = model;
    if (instructions !== undefined) payload.instructions = instructions;
    if (description !== undefined) payload.description = description;
    if (tools !== undefined) payload.tools = tools.map(t => (typeof t === 'string' ? { type: t } : t));
    if (tool_resources !== undefined) payload.tool_resources = tool_resources;

    // Use REST API directly with v2 header to avoid deprecation warnings
    const resp = await this.fetch(`https://api.openai.com/v1/assistants/${assistantId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message || `Assistant update failed (${resp.status})`);
    return data;
  }

  async deleteAssistant(assistantId) {
    // Use REST API directly with v2 header to avoid deprecation warnings
    const resp = await this.fetch(`https://api.openai.com/v1/assistants/${assistantId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message || `Assistant delete failed (${resp.status})`);
    return data;
  }

  async runAssistantMessageByAssistantId(assistantId, userMessage, { timeoutMs = 30000 } = {}) {
    if (!assistantId) throw new Error('assistantId is required');
    if (!userMessage || !userMessage.trim()) throw new Error('Message is required');

    // Create thread using REST API
    const threadResp = await this.fetch('https://api.openai.com/v1/threads', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({})
    });
    const thread = await threadResp.json();
    if (!threadResp.ok) throw new Error(thread?.error?.message || `Thread create failed (${threadResp.status})`);

    // Add message using REST API
    const msgResp = await this.fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({ role: 'user', content: userMessage })
    });
    const message = await msgResp.json();
    if (!msgResp.ok) throw new Error(message?.error?.message || `Message create failed (${msgResp.status})`);

    const { text, runId } = await this.runAssistantOnThread(assistantId, thread.id, { timeoutMs });
    return { threadId: thread.id, runId, text };
  }

  async createThread() {
    // Create thread using REST API with v2 header
    const resp = await this.fetch('https://api.openai.com/v1/threads', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({})
    });
    const t = await resp.json();
    if (!resp.ok) throw new Error(t?.error?.message || `Thread create failed (${resp.status})`);
    return t;
  }

  async sendMessageToThread(threadId, userMessage) {
    // Send message using REST API with v2 header
    const resp = await this.fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({ role: 'user', content: userMessage })
    });
    const message = await resp.json();
    if (!resp.ok) throw new Error(message?.error?.message || `Message create failed (${resp.status})`);
    return message;
  }

  async runAssistantOnThread(assistantId, threadId, { timeoutMs = 30000 } = {}) {
    // Create run using REST API
    const runResp = await this.fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({ assistant_id: assistantId })
    });
    const run = await runResp.json();
    if (!runResp.ok) throw new Error(run?.error?.message || `Run create failed (${runResp.status})`);

    const start = Date.now();
    let status = 'queued';
    while (Date.now() - start < timeoutMs) {
      // Check run status using REST API
      const statusResp = await this.fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${run.id}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      });
      const current = await statusResp.json();
      if (!statusResp.ok) throw new Error(current?.error?.message || `Run status check failed (${statusResp.status})`);

      status = current.status;
      if (status === 'completed') break;
      if (['failed', 'expired', 'cancelled'].includes(status)) throw new Error(`Assistant run ${status}`);
      await new Promise(r => setTimeout(r, 1000));
    }
    if (status !== 'completed') throw new Error('Assistant run timed out');

    // Get the most recent assistant message using REST API
    const messagesResp = await this.fetch(`https://api.openai.com/v1/threads/${threadId}/messages?limit=20`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    });
    const list = await messagesResp.json();
    if (!messagesResp.ok) throw new Error(list?.error?.message || `Messages list failed (${messagesResp.status})`);

    const messages = list.data || [];
    const assistantMsgs = messages.filter(m => m.role === 'assistant');
    const latest = assistantMsgs[0] || assistantMsgs[assistantMsgs.length - 1];
    let text = '';
    if (latest?.content?.length) {
      const parts = latest.content.filter(p => p.type === 'text');
      if (parts.length) text = parts.map(p => p.text.value).join('\n');
    }
    return { runId: run.id, text };
  }
  // ===== Vector store and file helpers with graceful fallback (SDK or REST) =====
  async createVectorStore({ name }) {
    // Prefer SDK if available
    if (this.openai?.beta?.vectorStores?.create) {
      return await this.openai.beta.vectorStores.create({ name });
    }
    // Fallback to REST
    const resp = await this.fetch('https://api.openai.com/v1/vector_stores', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({ name })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message || `Vector store create failed (${resp.status})`);
    return data;
  }

  _getMimeTypeForFilename(filename) {
    const ext = (filename || '').toLowerCase().split('.').pop();
    switch (ext) {
      case 'txt': return 'text/plain';
      case 'md': return 'text/markdown';
      case 'pdf': return 'application/pdf';
      case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      case 'html': case 'htm': return 'text/html';
      case 'csv': return 'text/csv';
      case 'json': return 'application/json';
      case 'py': return 'text/x-python';
      case 'js': return 'application/javascript';
      case 'ts': return 'application/typescript';
      case 'java': return 'text/x-java-source';
      case 'c': case 'h': return 'text/x-c';
      case 'cpp': case 'cc': case 'cxx': case 'hpp': return 'text/x-c++';
      default: return 'application/octet-stream';
    }
  }

  async uploadFile(filePath, { filename } = {}) {
    const name = filename || path.basename(filePath);

    // Check file size first (OpenAI has a 512MB limit)
    const stats = await fs.stat(filePath);
    if (stats.size > 512 * 1024 * 1024) {
      throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(1)}MB (max 512MB)`);
    }

    // Prefer SDK if available with a filename-aware File wrapper
    if (this.openai?.files?.create) {
      try {
        const { toFile } = require('openai/uploads');
        const fileLike = await toFile(fssync.createReadStream(filePath), name);
        return await this.openai.files.create({ file: fileLike, purpose: 'assistants' });
      } catch (e) {
        console.error('SDK uploadFile error:', e?.message || e);
        // Fall through to REST path below if toFile is unavailable
      }
    }
    // REST fallback with FormData (adds Assistants v2 header explicitly)
    const FormDataCtor = globalThis.FormData || require('form-data');
    const form = new FormDataCtor();
    form.append('file', fssync.createReadStream(filePath), { filename: name });
    form.append('purpose', 'assistants');
    const resp = await this.fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'OpenAI-Beta': 'assistants=v2'
      },
      body: form
    });
    const data = await resp.json();
    if (!resp.ok) {
      console.error('REST uploadFile error:', data);
      throw new Error(data?.error?.message || `File upload failed (${resp.status})`);
    }
    return data;
  }

  async getFileContent(fileId) {
    try {
      // Use REST API with v2 header for file operations
      const fileInfoResp = await this.fetch(`https://api.openai.com/v1/files/${fileId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      });

      if (!fileInfoResp.ok) {
        const errorData = await fileInfoResp.json();
        throw new Error(errorData?.error?.message || `Failed to get file info (${fileInfoResp.status})`);
      }

      const fileInfo = await fileInfoResp.json();

      // Download file content using v2 API
      const contentResp = await this.fetch(`https://api.openai.com/v1/files/${fileId}/content`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      });

      if (!contentResp.ok) {
        const errorData = await contentResp.text();
        throw new Error(`Failed to get file content (${contentResp.status}): ${errorData}`);
      }

      let content = await contentResp.text();

      // Determine content type based on filename
      const filename = fileInfo.filename || '';
      let contentType = 'text/plain';

      if (filename.endsWith('.json')) {
        contentType = 'application/json';
        try {
          // Pretty print JSON
          content = JSON.stringify(JSON.parse(content), null, 2);
        } catch (e) {
          // Keep original content if JSON parsing fails
        }
      } else if (filename.endsWith('.md')) {
        contentType = 'text/markdown';
      } else if (filename.endsWith('.html')) {
        contentType = 'text/html';
      } else if (filename.endsWith('.csv')) {
        contentType = 'text/csv';
      }

      return {
        content,
        contentType,
        filename: fileInfo.filename
      };
    } catch (error) {
      console.error('Get file content error:', error);
      throw new Error(`Failed to retrieve file content: ${error.message}`);
    }
  }

  // SDK-first batch uploader (works with multipart internally); returns created file objects
  async _tryUploadViaBatch(vectorStoreId, filePaths) {
    if (this.openai?.beta?.vectorStores?.fileBatches?.uploadAndPoll) {
      const streams = filePaths.map(p => fssync.createReadStream(p));
      const batch = await this.openai.beta.vectorStores.fileBatches.uploadAndPoll(vectorStoreId, { files: streams });
      // Normalize: collect file ids when available
      const files = batch?.files || batch?.data || [];
      return Array.isArray(files) ? files : [];
    }
    return null;
  }

  // Upload file to vector store following OpenAI patterns:
  // 1) Prefer SDK direct upload to vector store (multipart)
  // 2) Fallback: upload to Files API, then attach via file_batches (JSON)
  async uploadFileToVectorStore(vectorStoreId, filePath, { filename } = {}) {
    if (!vectorStoreId) throw new Error('vectorStoreId is required');
    const actualFilename = filename || path.basename(filePath);

    console.log(`Attempting to upload file to vector store: ${actualFilename} (path: ${filePath})`);

    // Always use the two-step process for better error handling and debugging
    const file = await this.uploadFile(filePath, { filename: actualFilename });
    console.log(`File uploaded to Files API successfully:`, file);
    return await this.addFileToVectorStore(vectorStoreId, file.id);
  }

  async uploadFilesToVectorStore(vectorStoreId, filePaths) {
    if (!Array.isArray(filePaths) || filePaths.length === 0) return [];
    // Try SDK batch upload (preferred)
    const batchRes = await this._tryUploadViaBatch(vectorStoreId, filePaths).catch(() => null);
    if (Array.isArray(batchRes) && batchRes.length) return batchRes;
    // Fallback: per-file Files API + attach
    const out = [];
    for (const p of filePaths) {
      const f = await this.uploadFile(p);
      const v = await this.addFileToVectorStore(vectorStoreId, f.id);
      out.push(v);
    }
    return out;
  }



  async addFileToVectorStore(vectorStoreId, fileId) {
    if (this.openai?.beta?.vectorStores?.files?.create) {
      try {
        return await this.openai.beta.vectorStores.files.create(vectorStoreId, { file_id: fileId });
      } catch (e) {
        // Log the actual SDK error for debugging
        console.error('SDK addFileToVectorStore error:', e?.message || e);
        throw new Error(e?.message || `Add file to vector store failed via SDK`);
      }
    }
    const resp = await this.fetch(`https://api.openai.com/v1/vector_stores/${vectorStoreId}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({ file_id: fileId })
    });
    const data = await resp.json();
    if (!resp.ok) {
      console.error('REST addFileToVectorStore error:', data);
      throw new Error(data?.error?.message || `Add file to vector store failed (${resp.status})`);
    }
    return data;
  }

  async attachFileIdsViaBatch(vectorStoreId, fileIds) {
    if (this.openai?.beta?.vectorStores?.fileBatches?.create) {
      const batch = await this.openai.beta.vectorStores.fileBatches.create(vectorStoreId, { file_ids: fileIds });
      if (this.openai?.beta?.vectorStores?.fileBatches?.poll) {
        await this.openai.beta.vectorStores.fileBatches.poll(vectorStoreId, batch.id);
      }
      return batch;
    }
    const resp = await this.fetch(`https://api.openai.com/v1/vector_stores/${vectorStoreId}/file_batches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({ file_ids: fileIds })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message || `Attach files batch failed (${resp.status})`);
    return data;
  }


  async removeFileFromVectorStore(vectorStoreId, fileId) {
    if (this.openai?.beta?.vectorStores?.files?.del) {
      return await this.openai.beta.vectorStores.files.del(vectorStoreId, fileId);
    }
    const resp = await this.fetch(`https://api.openai.com/v1/vector_stores/${vectorStoreId}/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data?.error?.message || `Remove file failed (${resp.status})`);
    }
    return { id: fileId, deleted: true };
  }

  async ensureAssistantHasFileSearch(assistantId, vectorStoreId) {
    const a = await this.getAssistant(assistantId);
    const tools = Array.isArray(a.tools) ? a.tools : [];
    const hasFile = tools.some(t => t.type === 'file_search');
    const updatedTools = hasFile ? tools : [...tools, { type: 'file_search' }];
    await this.updateAssistant(assistantId, {
      tools: updatedTools,
      tool_resources: { file_search: { vector_store_ids: [vectorStoreId] } }
    });
  }
}

module.exports = OpenAIAssistantService;
