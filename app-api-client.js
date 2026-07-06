// app-api-client.js
// Classic browser script. Isolates browser-to-api transport for the Clash Fleet Manager app.

(function () {
  const API_URL = 'api.php';

  async function requestJson(action, options = {}) {
    const method = options.method || 'GET';
    const body = options.body;

    const fetchOptions = {
      method,
      cache: 'no-store'
    };

    if (body !== undefined) {
      fetchOptions.headers = { 'Content-Type': 'application/json' };
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_URL}?action=${encodeURIComponent(action)}`, fetchOptions);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(data.error || `API request failed with HTTP ${response.status}`);
      error.code = data.code || '';
      error.status = response.status;
      error.payload = data;
      throw error;
    }

    return data;
  }

  window.FleetApiClient = {
    loadTimers() {
      return requestJson('load');
    },

    saveTimers(payload) {
      return requestJson('save', {
        method: 'POST',
        body: payload
      });
    },

    loadAccountViews() {
      return requestJson('loadViews');
    },

    saveAccountViews(payload) {
      return requestJson('saveViews', {
        method: 'POST',
        body: payload
      });
    }
  };
})();
