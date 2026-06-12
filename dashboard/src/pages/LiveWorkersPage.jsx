import { useCallback, useEffect, useState } from 'react';

import api from '../api/api';
import { connectSocket } from '../socket/socket';
import WorkerStatusTable from '../components/WorkerStatusTable.jsx';

const LiveWorkersPage = () => {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const fetchWorkers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');

    try {
      const response = await api.get('/dashboard/live-workers');
      setWorkers(response.data.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Çalışan verileri alınamadı.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkers();
    const intervalId = window.setInterval(() => fetchWorkers(true), 5000);
    const socket = connectSocket();
    const refresh = (message) => {
      setNotice(message);
      fetchWorkers(true);
      window.setTimeout(() => setNotice(''), 3000);
    };

    const handleSensorNew = () => refresh('Yeni sensör verisi alındı.');
    const handleWorkerStatus = () => refresh('Çalışan durumu güncellendi.');
    const handleAlarmNew = () => refresh('Yeni alarm bildirimi alındı.');

    socket.on('sensor:new', handleSensorNew);
    socket.on('worker:status', handleWorkerStatus);
    socket.on('alarm:new', handleAlarmNew);

    return () => {
      window.clearInterval(intervalId);
      socket.off('sensor:new', handleSensorNew);
      socket.off('worker:status', handleWorkerStatus);
      socket.off('alarm:new', handleAlarmNew);
    };
  }, [fetchWorkers]);

  return (
    <section className="page-section">
      <div className="page-header">
        <div>
          <h2>Çalışanları İzle</h2>
          <p>Son sensör verileri ve risk durumları</p>
        </div>
        {notice && <span className="notice">{notice}</span>}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="panel">
        <div className="panel-header">
          <h3>Çalışan Durumları</h3>
          {loading && <span className="muted">Yükleniyor...</span>}
        </div>
        <WorkerStatusTable workers={workers} />
      </section>
    </section>
  );
};

export default LiveWorkersPage;
