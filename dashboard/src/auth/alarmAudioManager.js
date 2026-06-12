/**
 * alarmAudioManager.js
 *
 * Saf JS modül singleton'ı — React lifecycle'ından tamamen bağımsız.
 * Socket listener modül yüklendiğinde bir kez kurulur ve asla kaldırılmaz.
 * Sayfa navigasyonu, component unmount, StrictMode çift çalıştırma vs.
 * hiçbirinden etkilenmez.
 */
import { connectSocket } from '../socket/socket';

// ── Alarm tipi tanımları ───────────────────────────────────────────────────
const CRITICAL_ALARM_TYPES = new Set([
  'sos',
  'emergency',
  'manual_emergency',
  'emergency_button',
  'fall_risk',
  'hard_impact',
  'inactivity',
  'post_fall_inactivity',
  'danger_zone_entry'
]);

const isCriticalAlarm = (alarm) => {
  if (!alarm) return false;
  const type = alarm.type?.toString().toLowerCase();
  const riskScore = Number(alarm.riskScore || 0);
  return riskScore >= 61 || CRITICAL_ALARM_TYPES.has(type);
};

// ── Web Audio oluşturucu ────────────────────────────────────────────────────
const createAlarmSound = () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  const ctx = new AudioContextClass();

  const playTone = (freq, t0, dur) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.45, t0 + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  };

  return {
    async playCriticalAlarm() {
      if (ctx.state === 'suspended') await ctx.resume();
      const t = ctx.currentTime;
      playTone(880, t,        0.22);
      playTone(660, t + 0.28, 0.22);
      playTone(880, t + 0.56, 0.22);
      playTone(660, t + 0.84, 0.22);
    },
    async playInactivityAlarm() {
      if (ctx.state === 'suspended') await ctx.resume();
      const t = ctx.currentTime;
      playTone(440, t,        0.45);
      playTone(330, t + 0.55, 0.45);
      playTone(440, t + 1.10, 0.45);
      playTone(330, t + 1.65, 0.45);
    }
  };
};

// ── Modül seviyesi durum (singleton) ───────────────────────────────────────
let _audioEnabled = false;
let _sound        = null;
const _subscribers = new Set(); // React state setter'ları

const _notifyAll = () => _subscribers.forEach(fn => fn(_audioEnabled));

const _playForAlarm = async (alarm) => {
  if (!_audioEnabled || !_sound) return;
  try {
    const type = alarm?.type?.toString().toLowerCase();
    if (type === 'inactivity' || type === 'post_fall_inactivity') {
      await _sound.playInactivityAlarm();
    } else {
      await _sound.playCriticalAlarm();
    }
  } catch (_) {
    // AudioContext suspend vs. — sessizce geç
  }
};

// ── Socket listener — MODÜL YÜKLENINCE BİR KEZ KURULUR, HİÇ KALDIRILMAZ ──
// React lifecycle'ından tamamen bağımsız.
const _socket = connectSocket();
_socket.on('alarm:new', (alarm) => {
  if (isCriticalAlarm(alarm)) {
    _playForAlarm(alarm);
  }
});

// ── Dışa açık API ──────────────────────────────────────────────────────────
export const getAudioEnabled = () => _audioEnabled;

export const enableAudio = async () => {
  try {
    if (!_sound) _sound = createAlarmSound();
    if (!_sound) return false;
    // Tarayıcı AudioContext kilidini açmak için kullanıcı hareketi sırasında
    // kısa bir test sesi çal.
    await _sound.playCriticalAlarm();
    _audioEnabled = true;
    _notifyAll();
    return true;
  } catch (_) {
    return false;
  }
};

export const disableAudio = () => {
  _audioEnabled = false;
  _notifyAll();
};

/** React bileşenlerinin durumu takip etmesi için subscribe/unsubscribe */
export const subscribeAudio = (callback) => {
  _subscribers.add(callback);
  return () => _subscribers.delete(callback);
};
