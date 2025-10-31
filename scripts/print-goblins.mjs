import goblinManagerService from '../services/goblinManagerService.js';

(async () => {
  try {
    // Wait briefly for service to initialize (it starts loading in constructor)
    await new Promise(r => setTimeout(r, 500));
    const result = await goblinManagerService.getGoblins();
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error inspecting goblins:', err);
    process.exit(1);
  }
})();
