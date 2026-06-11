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

const createAlarmSound = () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  const audioContext = new AudioContextClass();

  const playTone = (frequency, startTime, duration) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startTime);
    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.45, startTime + 0.04);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.02);
  };

  return {
    async playCriticalAlarm() {
      if (audioContext.state === 'suspended') await audioContext.resume();
      const now = audioContext.currentTime;
      playTone(880, now, 0.22);
      playTone(660, now + 0.28, 0.22);
      playTone(880, now + 0.56, 0.22);
      playTone(660, now + 0.84, 0.22);
    },
    async playInactivityAlarm() {
      if (audioContext.state === 'suspended') await audioContext.resume();
      const now = audioContext.currentTime;
      playTone(440, now, 0.45);
      playTone(330, now + 0.55, 0.45);
      playTone(440, now + 1.10, 0.45);
      playTone(330, now + 1.65, 0.45);
    }
  };
};

export const AlarmAudioProvider = ({ children }) => {
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [lastCriticalAlarm, setLastCriticalAlarm] = useState(null);
  const alarmSoundRef = useRef(null);

  // Play sound helper — always reads latest audioEnabled via ref
  const audioEnabledRef = useRef(audioEnabled);
  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  const playSoundForAlarm = useCallback(async (alarm) => {
    if (!audioEnabledRef.current || !alarmSoundRef.current) return;
    try {
      const type = alarm?.type?.toString().toLowerCase();
      if (type === 'inactivity' || type === 'post_fall_inactivity') {
        await alarmSoundRef.current.playInactivityAlarm();
      } else {
        await alarmSoundRef.current.playCriticalAlarm();
      }
    } catch (_) {
      // silent
    }
  }, []);

  // Global socket listener — lives at app root, survives page navigation
  useEffect(() => {
    const socket = connectSocket();

    socket.on('alarm:new', (alarm) => {
      if (isCriticalAlarm(alarm)) {
        setLastCriticalAlarm(alarm);
        playSoundForAlarm(alarm);
      }
    });

    return () => {
      socket.off('alarm:new');
    };
  }, [playSoundForAlarm]);

  const enableAudio = useCallback(async () => {
    try {
      if (!alarmSoundRef.current) {
        alarmSoundRef.current = createAlarmSound();
      }
      if (!alarmSoundRef.current) return false;

      // Play a test beep to unlock the AudioContext (browser requires user gesture)
      await alarmSoundRef.current.playCriticalAlarm();
      setAudioEnabled(true);
      return true;
    } catch (_) {
      return false;
    }
  }, []);

  const disableAudio = useCallback(() => {
    setAudioEnabled(false);
  }, []);

  return (
    <AlarmAudioContext.Provider
      value={{
        audioEnabled,
        lastCriticalAlarm,
        enableAudio,
        disableAudio,
        playSoundForAlarm
      }}
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
