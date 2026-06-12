import { useCallback, useEffect, useMemo, useState } from 'react';

import api from '../api/api';
import { connectSocket } from '../socket/socket';
import RiskChart from '../components/RiskChart.jsx';

const RiskChartPage = () => {
  const [workers, setWorkers] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [chartData, setChartData] = useState([]);
  const [loadingWorkers, setLoadingWorkers] = useState(true);
  const [loadingChart, setLoadingChart] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const fetchWorkers = useCallback(async () => {
    setLoadingWorkers(true);
    setError('');

    try {
      const [liveResponse, deviceResponse] = await Promise.all([
        api.get('/dashboard/live-workers'),
        api.get('/devices')
      ]);

      const liveWorkers = liveResponse.data.data || [];
      const deviceWorkers = (deviceResponse.data.data || []).map((device) => ({
        workerId: device.workerId?._id,
        workerName: device.workerId?.name,
        deviceName: device.deviceName
      }));

      const merged = [...liveWorkers, ...deviceWorkers].reduce((result, worker) => {
        if (!worker.workerId || result.some((item) => item.workerId === worker.workerId)) {
          return result;
        }

        return [
          ...result,
          {
            workerId: worker.workerId,
            workerName: worker.workerName || 'Çalışan',
            deviceName: worker.deviceName || '-'
          }
        ];
      }, []);

      setWorkers(merged);
      if (!selectedWorkerId && merged.length > 0) {
        setSelectedWorkerId(merged[0].workerId);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Çalışan listesi alınamadı.');
    } finally {
      setLoadingWorkers(false);
    }
  }, [selectedWorkerId]);

  const fetchChart = useCallback(async (workerId, silent = false) => {
    if (!workerId) {
      setChartData([]);
      return;
    }

    if (!silent) setLoadingChart(true);
    setError('');

    try {
      const response = await api.get(`/dashboard/risk-chart/${workerId}`);
      setChartData(response.data.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Risk grafiği alınamadı.');
    } finally {
      if (!silent) setLoadingChart(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkers();
  }, [fetchWorkers]);

  useEffect(() => {
    fetchChart(selectedWorkerId);
  }, [fetchChart, selectedWorkerId]);

  useEffect(() => {
    const socket = connectSocket();

    socket.on('sensor:new', () => {
      setNotice('Yeni sensör verisi alındı.');
      fetchChart(selectedWorkerId, true);
      window.setTimeout(() => setNotice(''), 3000);
    });

    return () => {
      socket.off('sensor:new');
    };
  }, [fetchChart, selectedWorkerId]);

  const selectedWorker = useMemo(
    () => workers.find((worker) => worker.workerId === selectedWorkerId),
    [selectedWorkerId, workers]
  );

  const handlePrepareRiskReport = () => {
    if (!selectedWorker || !chartData.length) {
      setNotice('Rapor için önce risk verisi olan bir çalışan seçin.');
      window.setTimeout(() => setNotice(''), 3000);
      return;
    }

    const scores = chartData
      .map((record) => Number(record.riskScore || 0))
      .filter((score) => Number.isFinite(score));
    const averageRisk = scores.length
      ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length)
      : 0;
    const maxRisk = scores.length ? Math.max(...scores) : 0;
    const dangerCount = chartData.filter((record) => record.riskLevel === 'danger').length;
    const warningCount = chartData.filter((record) => record.riskLevel === 'warning').length;

    const rows = [
      ['SafeWorker Risk Analizi Raporu'],
      ['Çalışan', selectedWorker.workerName || '-'],
      ['Cihaz', selectedWorker.deviceName || '-'],
      ['Hazırlanma Tarihi', new Date().toLocaleString('tr-TR')],
      ['Kayıt Sayısı', chartData.length],
      ['Ortalama Risk', averageRisk],
      ['En Yüksek Risk', maxRisk],
      ['Danger Kayıt', dangerCount],
      ['Warning Kayıt', warningCount],
      [],
      ['Zaman', 'Risk Puanı', 'Risk Seviyesi'],
      ...chartData.map((record) => [
        new Date(record.timestamp).toLocaleString('tr-TR'),
        record.riskScore ?? '',
        record.riskLevel ?? ''
      ])
    ];

    const csv = rows
      .map((row) =>
        row
          .map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`)
          .join(',')
      )
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeWorkerName = (selectedWorker.workerName || 'calisan')
      .toLowerCase()
      .replaceAll(' ', '-')
      .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ-]/gi, '');

    link.href = url;
    link.download = `risk-analizi-${safeWorkerName}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setNotice('Risk analizi raporu hazırlandı.');
    window.setTimeout(() => setNotice(''), 3000);
  };

  return (
    <section className="page-section">
      <div className="page-header">
        <div>
          <h2>Risk Grafiği</h2>
          <p>Son 50 sensör kaydına göre risk puanı değişimi</p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={handlePrepareRiskReport}
            disabled={!selectedWorker || !chartData.length}
          >
            Risk Analizi Raporu Hazırla
          </button>
          {notice && <span className="notice">{notice}</span>}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="panel">
        <div className="panel-header chart-toolbar">
          <div>
            <h3>{selectedWorker ? selectedWorker.workerName : 'Çalışan Seçimi'}</h3>
            <span className="muted">{selectedWorker?.deviceName || 'Cihaz bilgisi yok'}</span>
          </div>
          <label className="select-label" htmlFor="worker-select">
            Çalışan
            <select
              id="worker-select"
              value={selectedWorkerId}
              onChange={(event) => setSelectedWorkerId(event.target.value)}
              disabled={loadingWorkers || !workers.length}
            >
              {workers.map((worker) => (
                <option key={worker.workerId} value={worker.workerId}>
                  {worker.workerName}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loadingChart ? <div className="empty-state">Grafik yükleniyor...</div> : <RiskChart data={chartData} />}
      </section>
    </section>
  );
};

export default RiskChartPage;
