class ApiConfig {
  // WiFi üzerinden bağlantı: bilgisayarın yerel IP adresi
  // Telefon ve bilgisayar aynı WiFi ağındayken bu adres kullanılır.
  // Android emülatör kullanıyorsan: 'http://10.0.2.2:3000/api'
  // Localhost (sadece emülatör):     'http://127.0.0.1:3000/api'
  static const String baseUrl = 'http://10.73.19.123:3000/api';
  static const String demoDeviceId = '';

  static const Duration requestTimeout = Duration(seconds: 10);
}
