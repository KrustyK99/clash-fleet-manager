// Static app configuration and fallback data.
// This file is loaded before the main inline app script in index.html.

window.UPGRADE_TYPES = [
  '',
  'Builder',
  'Builder Base',
  'Lab',
  'Hero',
  'Pet',
  'Equipment',
  'Capital / Other'
];

window.NOTE_TEMPLATES = [
  '',
  'Start next builder upgrade',
  'Check lab',
  'Collect resources first',
  'Wait for builder potion',
  'Use book/hammer?',
  'Coordinate with family member',
  'No action needed yet'
];

// Default account list for quick entry.
// Edit these labels later if you want names like A01 Main, A02 Rush, etc.
window.ACCOUNT_PRESETS = [
  'Bart',
  'bro',
  'bruh',
  'Boob',
  'Dark Lord',
  'Dark Warrior',
  'Felicity',
  'Heisenberg',
  'Isabella',
  'Jesse Pinkman',
  'KrustyK',
  'Lady Scarlett',
  'Lord J',
  'Nigou',
  'RDP Account',
  'Saitama',
  'Terry',
  'Tortuga',
  'Zylink'
];

// Default Saved Views are bootstrap/fallback shared configuration.
// The live shared source is /data/account_views.json through api.php?action=loadViews/saveViews.
// Use accounts: null for a view that includes every known account.
window.DEFAULT_ACCOUNT_VIEWS = [
  {
    id: 'all',
    label: 'All Accounts',
    accounts: null,
    system: true
  },
  {
    id: 'view-1',
    label: 'View 1',
    accounts: ['Heisenberg', 'Jesse Pinkman', 'Dark Lord']
  },
  {
    id: 'view-2',
    label: 'View 2',
    accounts: ['Felicity', 'Isabella', 'Lady Scarlett']
  }
];

window.DEFAULT_SNAPSHOT_FRESHNESS_SETTINGS = {
  freshHours: 24,
  agingHours: 72
};

window.DEFAULT_ACCOUNT_TAG_MAP = {};