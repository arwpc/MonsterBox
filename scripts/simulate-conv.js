import fs from 'fs';

(async () => {
  try {
    const logs = [];
    const base = "http://localhost:3000/api/elevenlabs";
    const agentsRes = await fetch(base + "/agents", { method: "GET" });
    const agentsData = await agentsRes.json().catch(() => ({}));
    const list = (agentsData && agentsData.agents) || [];
    logs.push("Agents success=" + (!!agentsData.success) + " count=" + list.length);
    const ids = list.map(a => a.id || a.agent_id || a.agentId || a.uuid || a._id).filter(Boolean).slice(0, 3);
    const fillers = ["agent_dummy_1", "agent_dummy_2", "agent_dummy_3"];
    const simIds = (ids.length >= 3) ? ids : ids.concat(fillers.slice(0, 3 - ids.length));
    const texts = ["hello", "trick or treat", "boo!"];
    for (let i = 0; i < 3; i++) {
      const agentId = simIds[i];
      const text = texts[i];
      const r = await fetch(base + "/conversation/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId, text })
      });
      const body = await r.json().catch(() => ({}));
      logs.push("Test " + (i + 1) + ": agentId=" + agentId + " status=" + r.status + " ok=" + r.ok + " reply=" + (body.replyText || "") + " agentUsed=" + body.agentUsed);
    }
    fs.writeFileSync('scripts/sim-results.txt', logs.join('\n') + '\n');
  } catch (e) {
    fs.writeFileSync('scripts/sim-results.txt', 'Simulation error: ' + ((e && e.message) || e) + '\n');
  }
})();

