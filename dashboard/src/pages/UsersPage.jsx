import { useEffect, useState } from 'react';
import api from '../api/api';
import { useAuth } from '../auth/AuthContext.jsx';

const UsersPage = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('worker');
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/users');
      setUsers(response.data.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Kullanıcı listesi alınamadı.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRiskReport = async () => {
    try {
      const response = await api.get('/risk-report', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'risk_report_' + new Date().toISOString().slice(0,10) + '.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      setSuccess('Rapor indirildi.');
    } catch (err) {
      setError('Rapor oluşturulamadı.');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      await api.post('/users', { name, email, password, role });
      setSuccess('Kullanıcı başarıyla oluşturuldu.');
      setName('');
      setEmail('');
      setPassword('');
      setRole('worker');
      setShowForm(false);
      fetchUsers();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Kullanıcı oluşturulamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) {
      return;
    }

    setError('');
    setSuccess('');

    try {
      await api.delete(`/users/${userId}`);
      setSuccess('Kullanıcı başarıyla silindi.');
      fetchUsers();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Kullanıcı silinemedi.');
    }
  };

  return (
    <section className="page-section">
      <div className="page-header">
        <div>
          <h2>Kullanıcı Yönetimi</h2>
          <p>Yönetici ve çalışan hesaplarını yönetin</p>
          <button
            className="button"
            onClick={handleRiskReport}
            style={{ marginRight: '8px', background: '#4f46e5', color: '#fff' }}
          >
            Risk Analizi Raporu Oluştur
          </button>
        </div>
        <button
          className="button"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Kapat' : 'Yeni Kullanıcı Ekle'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}>{success}</div>}

      {showForm && (
        <section className="panel" style={{ padding: '20px' }}>
          <div className="panel-header" style={{ padding: '0 0 16px 0' }}>
            <h3>Yeni Kullanıcı Oluştur</h3>
          </div>
          <form onSubmit={handleCreateUser} style={{ display: 'grid', gap: '16px', maxWidth: '500px' }}>
            <div style={{ display: 'grid', gap: '6px' }}>
              <label style={{ fontWeight: 'bold', color: '#475569' }}>Ad Soyad</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                style={{
                  minHeight: '40px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '8px 12px'
                }}
              />
            </div>
            <div style={{ display: 'grid', gap: '6px' }}>
              <label style={{ fontWeight: 'bold', color: '#475569' }}>E-posta</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  minHeight: '40px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '8px 12px'
                }}
              />
            </div>
            <div style={{ display: 'grid', gap: '6px' }}>
              <label style={{ fontWeight: 'bold', color: '#475569' }}>Şifre</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  minHeight: '40px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '8px 12px'
                }}
              />
            </div>
            <div style={{ display: 'grid', gap: '6px' }}>
              <label style={{ fontWeight: 'bold', color: '#475569' }}>Rol</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={{
                  minHeight: '40px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  background: '#ffffff'
                }}
              >
                <option value="worker">Çalışan (Worker)</option>
                <option value="admin">Yönetici (Admin)</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button className="button" type="submit" disabled={submitting}>
                {submitting ? 'Kaydediliyor...' : 'Kullanıcıyı Kaydet'}
              </button>
              <button className="button button-secondary" type="button" onClick={() => setShowForm(false)}>
                İptal
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="panel-header">
          <h3>Kullanıcı Listesi</h3>
          {loading && <span className="muted">Yükleniyor...</span>}
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ad Soyad</th>
                <th>E-posta</th>
                <th>Rol</th>
                <th>Oluşturulma Tarihi</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {!users.length ? (
                <tr>
                  <td colSpan="5" className="empty-state">Kullanıcı kaydı bulunamadı.</td>
                </tr>
              ) : (
                users.map((item) => (
                  <tr key={item._id}>
                    <td style={{ fontWeight: 'bold' }}>{item.name}</td>
                    <td>{item.email}</td>
                    <td>
                      <span className={`status-badge ${item.role === 'admin' ? 'active' : 'resolved'}`}>
                        {item.role === 'admin' ? 'Yönetici' : 'Çalışan'}
                      </span>
                    </td>
                    <td>{new Date(item.createdAt).toLocaleString('tr-TR')}</td>
                    <td>
                      {currentUser?.id === item._id ? (
                        <span className="muted" style={{ fontStyle: 'italic', fontSize: '12px' }}>Mevcut Oturum</span>
                      ) : (
                        <button
                          className="button button-small"
                          style={{
                            background: '#fee2e2',
                            color: '#dc2626',
                            border: '1px solid #fca5a5'
                          }}
                          onClick={() => handleDeleteUser(item._id)}
                        >
                          Sil
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
};

export default UsersPage;
