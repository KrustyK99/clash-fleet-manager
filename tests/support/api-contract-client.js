const PHP_ENDPOINTS = {
  loadTimers: '/api.php?action=load',
  saveTimers: '/api.php?action=save',
  loadAccountViews: '/api.php?action=loadViews',
  saveAccountViews: '/api.php?action=saveViews',
  unsupportedAction(action) {
    return `/api.php?action=${encodeURIComponent(action)}`;
  }
};

function resolveApiContractTarget(options = {}) {
  const target = options.target || process.env.API_CONTRACT_TARGET || 'php';

  if (target !== 'php') {
    throw new Error(`Unsupported API_CONTRACT_TARGET: ${target}`);
  }

  return {
    name: target,
    endpoints: PHP_ENDPOINTS
  };
}

function createApiContractClient(request, options = {}) {
  const target = resolveApiContractTarget(options);
  const { endpoints } = target;

  return {
    target: target.name,

    loadTimers() {
      return request.get(endpoints.loadTimers);
    },

    saveTimers(payload) {
      return request.post(endpoints.saveTimers, { data: payload });
    },

    loadAccountViews() {
      return request.get(endpoints.loadAccountViews);
    },

    saveAccountViews(payload) {
      return request.post(endpoints.saveAccountViews, { data: payload });
    },

    getUnsupportedAction(action = 'doesNotExist') {
      return request.get(endpoints.unsupportedAction(action));
    },

    getSaveTimers() {
      return request.get(endpoints.saveTimers);
    },

    getSaveAccountViews() {
      return request.get(endpoints.saveAccountViews);
    },

    saveTimersRaw(rawBody, options = {}) {
      return request.post(endpoints.saveTimers, {
        headers: options.headers,
        data: rawBody
      });
    }
  };
}

module.exports = {
  createApiContractClient,
  resolveApiContractTarget
};
