// app-api-client.js
// Classic browser script. Isolates browser-to-api transport for the Clash Fleet Manager app.

(function () {
  const API_URL = 'api.php';

  const ENDPOINTS = {
    loadTimers: {
      action: 'load',
      method: 'GET'
    },
    saveTimers: {
      action: 'save',
      method: 'POST'
    },
    loadAccountViews: {
      action: 'loadViews',
      method: 'GET'
    },
    saveAccountViews: {
      action: 'saveViews',
      method: 'POST'
    }
  };

  function buildActionUrl(endpoint) {
    return `${API_URL}?action=${encodeURIComponent(endpoint.action)}`;
  }

  async function requestJson(endpointName, body) {
    const endpoint = ENDPOINTS[endpointName];
    const fetchOptions = {
      method: endpoint.method,
      cache: 'no-store'
    };

    if (body !== undefined) {
      fetchOptions.headers = { 'Content-Type': 'application/json' };
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(buildActionUrl(endpoint), fetchOptions);
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
      return requestJson('loadTimers');
    },

    saveTimers(payload) {
      return requestJson('saveTimers', payload);
    },

    loadAccountViews() {
      return requestJson('loadAccountViews');
    },

    saveAccountViews(payload) {
      return requestJson('saveAccountViews', payload);
    }
  };
})();
