'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { defaultSettings } = require('./game/engine');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

function readSettings() {
  const defaults = defaultSettings();
  defaults.defaultUsername = process.env.TIKTOK_USERNAME || 'revetaxn';
  defaults.demo = String(process.env.DEMO || '1') !== '0';
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const saved = JSON.parse(raw);
    return {
      ...defaults,
      ...saved,
      thresholds: { ...defaults.thresholds, ...(saved.thresholds || {}) },
      reviveGifts: Array.isArray(saved.reviveGifts) ? saved.reviveGifts : defaults.reviveGifts,
    };
  } catch (err) {
    return defaults;
  }
}

function saveSettings(settings) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = { readSettings, saveSettings, DATA_DIR, SETTINGS_FILE };
