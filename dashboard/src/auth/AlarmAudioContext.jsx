import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { connectSocket } from '../socket/socket';

const AlarmAudioContext = createContext(null);

const CRITICAL_ALARM_TYPES = [
  'sos',
  'emergency',
  'manual_emergency',
  'emergency_button',
  'fall_risk',
  'hard_impact',
  'inactivity',
  'post_fall_inactivity',
  'danger_zone_entry'
];

const isCriticalAlarm = (alarm) => {
  if (!alarm) return false;
  const type = alarm.type?.toString().toLowerCase();
  const riskScore = Number(alarm.riskScore || 0);
  return riskScore >= 61 || CRITICAL_ALARM_TYPES.includes(type);
};

const buildAlarmSound = () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  const ctx = new AudioContextClass();

  const playTone = (frequency, startTime, duration) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, startTime);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.45, startTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  };

  return {
    audioCtx: ctx,
    async playCriticalAlarm() {
      if (ctx.state === 'suspended') await ctx.resume();
      const now = ctx.currentTime;
      playTone(880, now,        0.22);
      playTone(660, now + 0.28, 0.22);
      playTone(880, now + 0.56, 0.22);
      playTone(660, now + 0.84, 0.22);
    },
    async playInactivityAlarm() {
      if (ctx.state === 'suspended') await ctx.resume();
      const now = ctx.currentTime;
      playTone(440, now,        0.45);
      playTone(330, now + 0.55, 0.45);
      playTone(440, now + 1.10, 0.45);
      playTone(330, now + 1.65, 0.45);
    }
  };
};

export const AlarmAudioProvider = ({ children }) => {
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [lastCriticalAlarm, setLastCriticalAlarm] = useState(null);

  const alarmSoundRef   = useRef(null);
  // Keep a ref in sync so the socket callback always sees the latest value
  // without needing to re-register the listener on every state change.
  const audioEnabledRef = useRef(false);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  // ── Global socket listener ────────────────────────────────────────────────
  // Registered ONCE at app root — survives page navigation.
  // Uses a named function so AlarmsPage cleanup (socket.off('alarm:new', fn))
  // cannot accidentally remove this handler.
  useEffect(() => {
    const socket = connectSocket();

    const handleAlarmNew = async (alarm) => {
      if (!isCriticalAlarm(alarm)) return;

      setLastCriticalAlarm(alarm);

      if (!audioEnabledRef.current || !alarmSoundRef.current) return;

      try {
        const type = alarm?.type?.toString().toLowerCase();
        if (type === 'inactivity' || type === 'post_fall_inactivity') {
          await alarmSoundRef.current.playInactivityAlarm();
        } else {
          await alarmSoundRef.current.playCriticalAlarm();
        }
      } catch (_) {
        // AudioContext might be suspended — silently ignore
      }
    };

    socket.on('alarm:new', handleAlarmNew);

    return () => {
      // Remove ONLY our specific handler, not all handlers on this event
      socket.off('alarm:new', handleAlarmNew);
    };
  }, []); // empty deps → registers once, reads live state via refs

  // ── Enable / disable API ──────────────────────────────────────────────────
  const enableAudio = useCallback(async () => {
    try {
      if (!alarmSoundRef.current) {
        alarmSoundRef.current = buildAlarmSound();
      }
      if (!alarmSoundRef.current) return false;

      // Play a short test beep to unlock AudioContext (browser requires user gesture)
      await alarmSoundRef.current.playCriticalAlarm();
      audioEnabledRef.current = true;
      setAudioEnabled(true);
      return true;
    } catch (_) {
      return false;
    }
  }, []);

  const disableAudio = useCallback(() => {
    audioEnabledRef.current = false;
    setAudioEnabled(false);
  }, []);

  return (
    <AlarmAudioContext.Provider
      value={{ audioEnabled, lastCriticalAlarm, enableAudio, disableAudio }}
    >
      {children}
    </AlarmAudioContext.Provider>
  );
};

export const useAlarmAudio = () => {
  const ctx = useContext(AlarmAudioContext);
  if (!ctx) throw new Error('useAlarmAudio must be used inside AlarmAudioProvider');
  return ctx;
};
