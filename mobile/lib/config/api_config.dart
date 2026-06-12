class ApiConfig {
  // Canli telefon testi: PC ve telefon ayni Wi-Fi aginda olmali.
  // Bu IP, backend calisan bilgisayarin Wi-Fi IPv4 adresidir.
  static const String backendHost = '10.73.174.27';
  static const String baseUrl = 'http://$backendHost:3000/api';
  static const String demoDeviceId = '';

  static const Duration requestTimeout = Duration(seconds: 10);
}
