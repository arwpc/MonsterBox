import axios from 'axios';

// Root-level hook that runs after all tests
after(async () => {
  if (process.env.KILL_SERVER_AFTER_TESTS === '1') {
    try {
      await axios.get('http://127.0.0.1:3100/__kill');
    } catch (_) {
      // ignore errors; server may already be down
    }
  }
});

