import { useCallback, useEffect, useRef, useState } from 'react';

import api from '../api/api';
import { connectSocket } from '../socket/socket';
import AlarmTable from '../components/AlarmTable.jsx';
import { useAlarmAudio } from '../auth/AlarmAudioContext.jsx';

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

const FILTERS = [
  { key: 'all', label: 'Tümü' },
  { key: 'active', label: 'Aktif' },
  { key: 'resolved', label: 'Çözülen' },
  { key: 'critical', label: 'Kritik' },
  { key: 'sos', label: 'SOS' }
];

const isCriticalAlarm = (alarm) => {
  if (!alarm) return false;
  const type = alarm.type?.toString().toLowerCase();
  const riskScore = Number(alarm.riskScore || 0);
  return riskScore >= 61 || CRITICAL_ALARM_TYPES.includes(type);
};

const AlarmsPage = () => {
  const [alarms, setAlarms] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [criticalNotice, setCriticalNotice] = useState('');
  const [resolvingId, setResolvingId] = useState(null);

  const criticalNoticeTimerRef = useRef(null);

  // Global audio state — persists across page navigation
  const { audioEnabled, enableAudio, disableAudio } = useAlarmAudio();

  const fetchAlarms = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');

    try {
      const response = await api.get('/alarms');
      setAlarms(response.data.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Alarm listesi alınamadı.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const filteredAlarms = alarms.filter((alarm) => {
    const type = alarm.type?.toString().toLowerCase();
    const status = alarm.status?.toString().toLowerCase();

    if (activeFilter === 'active') return status === 'active';
    if (activeFilter === 'resolved') return status === 'resolved';
    if (activeFilter === 'critical') return isCriticalAlarm(alarm);
    if (activeFilter === 'sos') {
      return ['sos', 'emergency', 'manual_emergency', 'emergency_button'].includes(type);
    }

    return true;
  });

  const filterCounts = {
    all: alarms.length,
    active: alarms.filter((alarm) => alarm.status === 'active').length,
    resolved: alarms.filter((alarm) => alarm.status === 'resolved').length,
    critical: alarms.filter((alarm) => isCriticalAlarm(alarm)).length,
    sos: alarms.filter((alarm) =>
      ['sos', 'emergency', 'manual_emergency', 'emergency_button'].includes(
        alarm.type?.toString().toLowerCase()
      )
    ).length
  };

  const showCriticalWarning = (alarm) => {
    const alarmType = alarm?.type || 'kritik alarm';
    const alarmMessage = alarm?.message || 'Kritik alarm bildirimi alındı.';
    setCriticalNotice(`${alarmType.toUpperCase()} - ${alarmMessage}`);

    if (criticalNoticeTimerRef.current) {
      window.clearTimeout(criticalNoticeTimerRef.current);
    }

    criticalNoticeTimerRef.current = window.setTimeout(() => {
      setCriticalNotice('');
    }, 10000);
  };

  const handleEnableAudio = async () => {
    const ok = await enableAudio();
    if (ok) {
      setNotice('Sesli alarm etkinleştirildi.');
      window.setTimeout(() => setNotice(''), 4000);
    } else {
      setError('Sesli alarm aktifleştirilemedi. Tarayıcı izinleri veya ses ayarlarını kontrol edin.');
    }
  };

  const handleDisableAudio = () => {
    disableAudio();
    setNotice('Sesli alarm kapatıldı.');
    window.setTimeout(() => setNotice(''), 3000);
  };

  // Page-level socket: only for UI updates (alarm list refresh + critical banner)
  // NOTE: Use a named handler so cleanup doesn't wipe the global audio listener
  useEffect(() => {
    fetchAlarms();
    const socket = connectSocket();

    const handleAlarmNew = (alarm) => {
      setNotice('Yeni alarm bildirimi alındı.');
      fetchAlarms(true);

      if (isCriticalAlarm(alarm)) {
        showCriticalWarning(alarm);
      }

      window.setTimeout(() => setNotice(''), 3000);
    };

    socket.on('alarm:new', handleAlarmNew);

    return () => {
      socket.off('alarm:new', handleAlarmNew); // Remove ONLY this handler
      if (criticalNoticeTimerRef.current) {
        window.clearTimeout(criticalNoticeTimerRef.current);
      }
    };
  }, [fetchAlarms]);

  const handleResolve = async (alarmId) => {
    setResolvingId(alarmId);
    setError('');

    try {
      await api.patch(`/alarms/${alarmId}/resolve`);
      setNotice('Alarm çözüldü.');
      await fetchAlarms(true);
      window.setTimeout(() => setNotice(''), 3000);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Alarm çözülemedi.');
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <section className="page-section">
      <div className="page-header">
        <div>
          <h2>Alarmlar</h2>
          <p>Aktif ve geçmiş alarm kayıtları</p>
        </div>

        <div className="page-actions">
          <button
            type="button"
            className={audioEnabled ? 'secondary-button success' : 'secondary-button'}
            onClick={audioEnabled ? handleDisableAudio : handleEnableAudio}
          >
            {audioEnabled ? '🔊 Sesli Alarm Açık — Kapat' : '🔇 Sesli Alarmı Aktifleştir'}
          </button>
          {notice && <span className="notice">{notice}</span>}
        </div>
      </div>

      {criticalNotice && (
        <div className="critical-alarm-banner">
          <strong>KRİTİK ALARM</strong>
          <span>{criticalNotice}</span>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <section className="panel">
        <div className="panel-header">
          <div>
            <h3>Alarm Geçmişi</h3>
            <p className="muted">
              Seçili filtre: {FILTERS.find((filter) => filter.key === activeFilter)?.label}
            </p>
          </div>
          {loading && <span className="muted">Yükleniyor...</span>}
        </div>

        <div className="filter-bar">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={
                activeFilter === filter.key
                  ? 'filter-button active'
                  : 'filter-button'
              }
              onClick={() => setActiveFilter(filter.key)}
            >
              {filter.label}
              <span>{filterCounts[filter.key]}</span>
            </button>
          ))}
        </div>

        <AlarmTable
          alarms={filteredAlarms}
          showDevice
          onResolve={handleResolve}
          resolvingId={resolvingId}
        />
      </section>
    </section>
  );
};

export default AlarmsPage;