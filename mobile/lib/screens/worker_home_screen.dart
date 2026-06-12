import 'dart:async';
import 'dart:math';

import 'package:battery_plus/battery_plus.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:sensors_plus/sensors_plus.dart';

import '../models/api_response.dart';
import '../models/sensor_payload.dart';
import '../models/user_model.dart';
import '../services/api_service.dart';
import '../services/sensor_service.dart';
import '../services/shift_service.dart';
import '../services/zone_service.dart';
import '../storage/local_storage.dart';
import '../widgets/primary_button.dart';
import '../widgets/status_card.dart';
import 'demo_simulation_screen.dart';
import 'emergency_screen.dart';
import 'login_screen.dart';
import 'zone_scan_screen.dart';

class WorkerHomeScreen extends StatefulWidget {
  const WorkerHomeScreen({super.key});

  @override
  State<WorkerHomeScreen> createState() => _WorkerHomeScreenState();
}

class _WorkerHomeScreenState extends State<WorkerHomeScreen> {
  final _deviceController = TextEditingController();
  final _shiftService = ShiftService();
  final _zoneService = ZoneService();
  UserModel? _user;
  String? _shiftId;
  String? _message;
  bool _isBusy = false;

  List<LocalDangerZone> _dangerZones = [];
  bool _dangerZonesInitialized = false;
  String? _currentActiveZoneQr;
  bool _isMockGpsActive = false;

  // Background Sensor and Tracking Deactivation
  final _sensorService = SensorService();
  final _battery = Battery();

  StreamSubscription<AccelerometerEvent>? _accelerometerSubscription;
  StreamSubscription<GyroscopeEvent>? _gyroscopeSubscription;
  Timer? _autoSendTimer;

  double _accX = 1;
  double _accY = 2;
  double _accZ = 3;
  double _gyroX = 0.1;
  double _gyroY = 0.2;
  double _gyroZ = 0.3;

  double _lastMovementMagnitude = 0;
  DateTime _lastMovementAt = DateTime.now();
  DateTime? _lastImmediateTriggerTime;
  DateTime? _lastCriticalEventAt; // düşme/darbe algılandığı an

  int _batteryLevel = 80;
  String _networkStatus = 'online';

  double? _latitude;
  double? _longitude;
  double? _locationAccuracy;
  String _locationStatus = 'Konum alınmadı';
  bool _isLocationLoading = false;
  bool _sensorWarningShown = false;

  bool get _isInactive {
    final secondsWithoutMovement = DateTime.now()
        .difference(_lastMovementAt)
        .inSeconds;
    return secondsWithoutMovement >= 15;
  }

  // Düşme/darbe sonrası 30 sn hareketsizlik kontrolü
  bool get _isPostFallInactive {
    final criticalAt = _lastCriticalEventAt;
    if (criticalAt == null) return false;

    // Olayın üzerinden 3 dakikadan fazla geçmişse artık sayma
    if (DateTime.now().difference(criticalAt).inMinutes >= 3) return false;

    // Düşmeden itibaren 30 saniye boyunca hareket yok mu?
    final secsSinceFall = DateTime.now().difference(criticalAt).inSeconds;
    final secsSinceMove = DateTime.now().difference(_lastMovementAt).inSeconds;

    return secsSinceFall >= 30 && secsSinceMove >= 30;
  }

  @override
  void initState() {
    super.initState();
    _loadState();
  }

  @override
  void dispose() {
    _autoSendTimer?.cancel();
    _accelerometerSubscription?.cancel();
    _gyroscopeSubscription?.cancel();
    _deviceController.dispose();
    super.dispose();
  }

  Future<void> _loadState() async {
    final user = await LocalStorage.getUser();
    final deviceId = await LocalStorage.getDeviceId();

    if (!mounted) return;
    setState(() {
      _user = user;
      _deviceController.text = deviceId ?? '';
    });

    if (deviceId == null || deviceId.isEmpty) {
      await _fetchDeviceAutomatically();
    } else {
      _startSensorStreams();
      _startAutoSend();
    }

    _syncActiveShift();
  }

  double _calculateMagnitude(double x, double y, double z) {
    return sqrt(x * x + y * y + z * z);
  }

  void _updateMovementStatus(double x, double y, double z) {
    final currentMagnitude = _calculateMagnitude(x, y, z);
    final difference = (currentMagnitude - _lastMovementMagnitude).abs();

    if (difference > 0.35) {
      _lastMovementAt = DateTime.now();
    }

    _lastMovementMagnitude = currentMagnitude;
  }

  void _startSensorStreams() {
    if (_accelerometerSubscription != null || _gyroscopeSubscription != null) {
      return;
    }

    try {
      _accelerometerSubscription = accelerometerEventStream().listen((event) {
        if (!mounted) return;

        _updateMovementStatus(event.x, event.y, event.z);

        setState(() {
          _accX = event.x;
          _accY = event.y;
          _accZ = event.z;
        });

        _checkRealtimeAlarms(event.x, event.y, event.z, _gyroX, _gyroY, _gyroZ);
      }, onError: (_) => _setSensorWarning());

      _gyroscopeSubscription = gyroscopeEventStream().listen((event) {
        if (!mounted) return;

        setState(() {
          _gyroX = event.x;
          _gyroY = event.y;
          _gyroZ = event.z;
        });

        _checkRealtimeAlarms(_accX, _accY, _accZ, event.x, event.y, event.z);
      }, onError: (_) => _setSensorWarning());
    } catch (_) {
      _setSensorWarning();
    }
  }

  void _checkRealtimeAlarms(
    double accX,
    double accY,
    double accZ,
    double gyroX,
    double gyroY,
    double gyroZ,
  ) {
    final accMag = _calculateMagnitude(accX, accY, accZ);
    final gyroMag = _calculateMagnitude(gyroX, gyroY, gyroZ);

    final isHardImpact = accMag > 25;
    final isFallRisk = accMag > 15 && gyroMag > 3.0;

    if (isHardImpact || isFallRisk) {
      final now = DateTime.now();
      if (_lastImmediateTriggerTime == null ||
          now.difference(_lastImmediateTriggerTime!).inSeconds >= 5) {
        _lastImmediateTriggerTime = now;
        _lastCriticalEventAt = now; // düşme/darbe zamanını kaydet
        _sendInstantSensorData(accX, accY, accZ, gyroX, gyroY, gyroZ);
      }
    }
  }

  Future<void> _sendInstantSensorData(
    double accX,
    double accY,
    double accZ,
    double gyroX,
    double gyroY,
    double gyroZ,
  ) async {
    try {
      final workerId = await LocalStorage.getUserId();
      final deviceId = await LocalStorage.getDeviceId();
      final shiftId = await LocalStorage.getShiftId();

      if (workerId == null ||
          workerId.isEmpty ||
          deviceId == null ||
          deviceId.isEmpty) {
        return;
      }

      final payload = SensorPayload(
        workerId: workerId,
        deviceId: deviceId,
        shiftId: shiftId,
        timestamp: DateTime.now(),
        accelerometer: SensorVector(x: accX, y: accY, z: accZ),
        gyroscope: SensorVector(x: gyroX, y: gyroY, z: gyroZ),
        batteryLevel: _batteryLevel,
        networkStatus: _networkStatus,
        location: _buildLocation(),
        inactivity: _isInactive,
        postFallInactivity: _isPostFallInactive,
      );

      await _sensorService.sendSensorData(payload);
    } catch (_) {
      // Silent error
    }
  }

  void _setSensorWarning() {
    if (_sensorWarningShown || !mounted) return;

    setState(() {
      _sensorWarningShown = true;
      _message = 'Sensör okunamadı. Varsayılan normal değerler kullanılacak.';
    });
  }

  void _startAutoSend() {
    _autoSendTimer?.cancel();

    _autoSendTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      _sendSensorData();
    });
  }

  Future<void> _sendSensorData() async {
    try {
      final payload = await _buildPayload();
      if (payload == null) return;

      await _sensorService.sendSensorData(payload);
    } catch (_) {
      // Silent error for periodic background sending
    }
  }

  Future<SensorPayload?> _buildPayload() async {
    final workerId = await LocalStorage.getUserId();
    final deviceId = await LocalStorage.getDeviceId();
    final shiftId = await LocalStorage.getShiftId();

    if (workerId == null ||
        workerId.isEmpty ||
        deviceId == null ||
        deviceId.isEmpty) {
      return null;
    }

    await _refreshDeviceStatus();
    await _refreshLocation();

    return SensorPayload(
      workerId: workerId,
      deviceId: deviceId,
      shiftId: shiftId,
      timestamp: DateTime.now(),
      accelerometer: SensorVector(x: _accX, y: _accY, z: _accZ),
      gyroscope: SensorVector(x: _gyroX, y: _gyroY, z: _gyroZ),
      batteryLevel: _batteryLevel,
      networkStatus: _networkStatus,
      location: _buildLocation(),
      inactivity: _isInactive,
      postFallInactivity: _isPostFallInactive,
    );
  }

  SensorLocation? _buildLocation() {
    if (_latitude == null || _longitude == null) return null;

    return SensorLocation(
      latitude: _latitude!,
      longitude: _longitude!,
      accuracy: _locationAccuracy,
    );
  }

  Future<void> _refreshDeviceStatus() async {
    try {
      final batteryLevel = await _battery.batteryLevel;
      final connectivity = await Connectivity().checkConnectivity();
      final isOffline = connectivity.contains(ConnectivityResult.none);

      if (!mounted) return;

      setState(() {
        _batteryLevel = batteryLevel;
        _networkStatus = isOffline ? 'offline' : 'online';
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _batteryLevel = 80;
        _networkStatus = 'online';
      });
    }
  }

  void _initializeDangerZones(double baseLat, double baseLng) {
    setState(() {
      _dangerZones = [
        LocalDangerZone(
          name: 'Kimyasal Depo',
          qrCode: 'ZONE-CHEM-001',
          riskLevel: 'high',
          center: LatLng(baseLat + 0.0003, baseLng + 0.0003),
          radius: 20,
          color: const Color(0xFFDC2626),
        ),
        LocalDangerZone(
          name: 'Forklift Alanı',
          qrCode: 'ZONE-FORK-001',
          riskLevel: 'medium',
          center: LatLng(baseLat - 0.0003, baseLng + 0.0003),
          radius: 20,
          color: const Color(0xFFD97706),
        ),
        LocalDangerZone(
          name: 'Bakım Alanı',
          qrCode: 'ZONE-MAINT-001',
          riskLevel: 'high',
          center: LatLng(baseLat + 0.0003, baseLng - 0.0003),
          radius: 20,
          color: const Color(0xFF2563EB),
        ),
      ];
      _dangerZonesInitialized = true;
    });
  }

  Future<void> _checkGeofences(double lat, double lng) async {
    if (_dangerZones.isEmpty) return;

    String? enteredZoneQr;

    for (final zone in _dangerZones) {
      final distance = Geolocator.distanceBetween(
        lat,
        lng,
        zone.center.latitude,
        zone.center.longitude,
      );

      if (distance <= zone.radius) {
        enteredZoneQr = zone.qrCode;
        break;
      }
    }

    if (enteredZoneQr != _currentActiveZoneQr) {
      final oldZoneQr = _currentActiveZoneQr;
      setState(() {
        _currentActiveZoneQr = enteredZoneQr;
      });

      if (enteredZoneQr != null) {
        final zone = _dangerZones.firstWhere((z) => z.qrCode == enteredZoneQr);
        _showMessage(
          'GPS: ${zone.name} bölgesine girildi! API kaydı yapılıyor...',
        );

        try {
          final workerId = await LocalStorage.getUserId();
          if (workerId != null && workerId.isNotEmpty) {
            final response = await _zoneService.scanZone(
              workerId: workerId,
              qrCode: enteredZoneQr,
            );
            final data = response.data as Map<String, dynamic>;
            final alarm = data['alarm'] as Map<String, dynamic>?;

            if (alarm != null) {
              _showMessage(
                '${zone.name} girişi kaydedildi! Alarm: ${alarm['message']}',
              );
            } else {
              _showMessage('${zone.name} girişi kaydedildi.');
            }
          }
        } catch (e) {
          print('GPS zone entry api error: $e');
        }
      } else {
        if (oldZoneQr != null) {
          final zone = _dangerZones.firstWhere((z) => z.qrCode == oldZoneQr);
          _showMessage('GPS: ${zone.name} bölgesinden çıkıldı.');
        }
      }
    }
  }

  Future<void> _refreshLocation() async {
    if (_isMockGpsActive) {
      if (_latitude != null && _longitude != null) {
        _checkGeofences(_latitude!, _longitude!);
      }
      return;
    }
    if (_isLocationLoading) return;

    if (mounted) {
      setState(() {
        _isLocationLoading = true;
        _locationStatus = 'Konum alınıyor...';
      });
    }

    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();

      if (!serviceEnabled) {
        if (!mounted) return;
        setState(() {
          _locationStatus = 'Konum servisi kapalı';
          _isLocationLoading = false;
        });
        return;
      }

      var permission = await Geolocator.checkPermission();

      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.denied) {
        if (!mounted) return;
        setState(() {
          _locationStatus = 'Konum izni verilmedi';
          _isLocationLoading = false;
        });
        return;
      }

      if (permission == LocationPermission.deniedForever) {
        if (!mounted) return;
        setState(() {
          _locationStatus = 'Konum izni kalıcı olarak reddedildi';
          _isLocationLoading = false;
        });
        return;
      }

      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );

      if (!mounted) return;

      setState(() {
        _latitude = position.latitude;
        _longitude = position.longitude;
        _locationAccuracy = position.accuracy;
        _locationStatus = 'Konum alındı';
        _isLocationLoading = false;

        if (!_dangerZonesInitialized) {
          _initializeDangerZones(position.latitude, position.longitude);
        }
      });

      _checkGeofences(position.latitude, position.longitude);
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _locationStatus = 'Konum alınamadı';
        _isLocationLoading = false;
      });
    }
  }

  Future<void> _syncActiveShift() async {
    try {
      final apiService = ApiService();
      final response = await apiService.get('/shifts/my-active');
      final shiftData = response.data as Map<String, dynamic>?;
      if (shiftData != null) {
        final shiftId = shiftData['_id']?.toString() ?? '';
        if (shiftId.isNotEmpty) {
          await LocalStorage.saveShiftId(shiftId);
          if (mounted) {
            setState(() {
              _shiftId = shiftId;
            });
          }
          return;
        }
      }
      await LocalStorage.clearShiftId();
      if (mounted) {
        setState(() {
          _shiftId = null;
        });
      }
    } catch (e) {
      print('Sync active shift failed: $e');
      final localShiftId = await LocalStorage.getShiftId();
      if (mounted) {
        setState(() {
          _shiftId = localShiftId;
        });
      }
    }
  }

  Future<void> _fetchDeviceAutomatically() async {
    setState(() => _isBusy = true);
    try {
      final apiService = ApiService();
      final deviceResponse = await apiService.get('/devices/my');
      final deviceData = deviceResponse.data as Map<String, dynamic>;
      final deviceId = deviceData['_id']?.toString() ?? '';
      if (deviceId.isNotEmpty) {
        await LocalStorage.saveDeviceId(deviceId);
        if (mounted) {
          setState(() {
            _deviceController.text = deviceId;
          });
          _showMessage('Cihaz ID otomatik senkronize edildi.');
        }
        _startSensorStreams();
        _startAutoSend();
      } else {
        _showMessage('Cihaz ID otomatik çekilemedi.');
      }
    } catch (e) {
      _showMessage('Cihaz ID otomatik çekilemedi: $e');
    } finally {
      if (mounted) {
        setState(() => _isBusy = false);
      }
    }
  }

  Future<String?> _requireDeviceId() async {
    var deviceId = _deviceController.text.trim();
    if (deviceId.isEmpty) {
      await _fetchDeviceAutomatically();
      deviceId = _deviceController.text.trim();
    }
    if (deviceId.isEmpty) {
      _showMessage('Cihaz bilgisi alınamadı.');
      return null;
    }
    return deviceId;
  }

  void _showMessage(String message) {
    if (!mounted) return;
    setState(() => _message = message);
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _startShift() async {
    final user = _user;
    final deviceId = await _requireDeviceId();

    if (user == null || deviceId == null) return;

    setState(() => _isBusy = true);
    try {
      final shiftId = await _shiftService.startShift(
        workerId: user.id,
        deviceId: deviceId,
      );

      setState(() => _shiftId = shiftId);
      _showMessage('Vardiya başlatıldı.');
    } on ApiException catch (error) {
      _showMessage(error.message);
    } catch (_) {
      _showMessage("Backend'e bağlanılamadı. API adresini kontrol edin.");
    } finally {
      if (mounted) {
        setState(() => _isBusy = false);
      }
    }
  }

  Future<void> _endShift() async {
    final shiftId = _shiftId;
    if (shiftId == null || shiftId.isEmpty) {
      _showMessage('Aktif vardiya bulunamadı.');
      return;
    }

    setState(() => _isBusy = true);
    try {
      await _shiftService.endShift(shiftId);
      setState(() => _shiftId = null);
      _showMessage('Vardiya durduruldu.');
    } on ApiException catch (error) {
      _showMessage(error.message);
    } catch (_) {
      _showMessage("Backend'e bağlanılamadı. API adresini kontrol edin.");
    } finally {
      if (mounted) {
        setState(() => _isBusy = false);
      }
    }
  }

  Future<void> _logout() async {
    _autoSendTimer?.cancel();
    _accelerometerSubscription?.cancel();
    _gyroscopeSubscription?.cancel();

    setState(() => _isBusy = true);
    try {
      final deviceId = await LocalStorage.getDeviceId();
      if (deviceId != null && deviceId.isNotEmpty) {
        final apiService = ApiService();
        await apiService.patch('/devices/$deviceId/status', {
          'networkStatus': 'offline',
        });
      }
      final shiftId = _shiftId;
      if (shiftId != null && shiftId.isNotEmpty) {
        await _shiftService.endShift(shiftId);
      }
    } catch (e) {
      print('Logout status sync failed: $e');
    }

    await LocalStorage.clearAll();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  void _open(Widget screen) {
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => screen)).then((_) => _loadState());
  }

  @override
  Widget build(BuildContext context) {
    final user = _user;
    final hasActiveShift = _shiftId != null && _shiftId!.isNotEmpty;

    return Scaffold(
      appBar: AppBar(
        title: const Text('SafeWorker Mobil'),
        actions: [
          IconButton(
            tooltip: 'Çıkış',
            onPressed: _logout,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            StatusCard(
              title: 'Çalışan',
              value: user?.name ?? 'Worker',
              subtitle: user?.email ?? '',
              icon: Icons.badge_outlined,
            ),
            StatusCard(
              title: 'Vardiya Durumu',
              value: hasActiveShift ? 'Aktif' : 'Başlatılmadı',
              subtitle: '',
              icon: Icons.schedule,
              color: hasActiveShift
                  ? const Color(0xFF15803D)
                  : const Color(0xFFB45309),
            ),

            // Konum Haritası
            Card(
              clipBehavior: Clip.antiAlias,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.all(12.0),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.map_outlined,
                          color: Color(0xFF0F766E),
                        ),
                        const SizedBox(width: 8),
                        const Text(
                          'Mevcut Konum',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                          ),
                        ),
                        const Spacer(),
                        if (_latitude != null && _longitude != null)
                          Text(
                            '${_latitude!.toStringAsFixed(5)}, ${_longitude!.toStringAsFixed(5)}',
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 12,
                            ),
                          ),
                      ],
                    ),
                  ),
                  SizedBox(
                    height: 240,
                    child: _latitude != null && _longitude != null
                        ? FlutterMap(
                            options: MapOptions(
                              initialCenter: LatLng(_latitude!, _longitude!),
                              initialZoom: 16.5,
                            ),
                            children: [
                              TileLayer(
                                urlTemplate:
                                    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                                userAgentPackageName:
                                    'com.example.safeworker_mobile',
                              ),
                              CircleLayer(
                                circles: _dangerZones.map((zone) {
                                  return CircleMarker(
                                    point: zone.center,
                                    color: zone.color.withValues(alpha: 0.25),
                                    borderColor: zone.color,
                                    borderStrokeWidth: 2,
                                    useRadiusInMeter: true,
                                    radius: zone.radius,
                                  );
                                }).toList(),
                              ),
                              MarkerLayer(
                                markers: [
                                  Marker(
                                    point: LatLng(_latitude!, _longitude!),
                                    width: 40,
                                    height: 40,
                                    child: const Icon(
                                      Icons.location_on,
                                      color: Color(0xFFDC2626),
                                      size: 36,
                                    ),
                                  ),
                                  ..._dangerZones.map((zone) {
                                    IconData iconData;
                                    if (zone.qrCode == 'ZONE-CHEM-001') {
                                      iconData = Icons.science_outlined;
                                    } else if (zone.qrCode == 'ZONE-FORK-001') {
                                      iconData = Icons.warehouse_outlined;
                                    } else {
                                      iconData = Icons.construction_outlined;
                                    }

                                    return Marker(
                                      point: zone.center,
                                      width: 90,
                                      height: 60,
                                      child: Column(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Container(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 5,
                                              vertical: 2,
                                            ),
                                            decoration: BoxDecoration(
                                              color: Colors.white,
                                              borderRadius:
                                                  BorderRadius.circular(4),
                                              border: Border.all(
                                                color: zone.color,
                                                width: 1.5,
                                              ),
                                              boxShadow: [
                                                BoxShadow(
                                                  color: Colors.black
                                                      .withValues(alpha: 0.15),
                                                  blurRadius: 4,
                                                  offset: const Offset(0, 2),
                                                ),
                                              ],
                                            ),
                                            child: Text(
                                              zone.name,
                                              style: TextStyle(
                                                fontSize: 8,
                                                fontWeight: FontWeight.w900,
                                                color: zone.color,
                                              ),
                                              textAlign: TextAlign.center,
                                            ),
                                          ),
                                          Icon(
                                            iconData,
                                            color: zone.color,
                                            size: 20,
                                          ),
                                        ],
                                      ),
                                    );
                                  }),
                                ],
                              ),
                            ],
                          )
                        : Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const CircularProgressIndicator(
                                  color: Color(0xFF0F766E),
                                ),
                                const SizedBox(height: 8),
                                const Text(
                                  'GPS konumu alınıyor...',
                                  style: TextStyle(color: Color(0xFF64748B)),
                                ),
                                const SizedBox(height: 12),
                                TextButton.icon(
                                  icon: const Icon(Icons.map_outlined),
                                  label: const Text(
                                    'Demo Konumu Kullan (Kadıköy)',
                                  ),
                                  style: TextButton.styleFrom(
                                    foregroundColor: const Color(0xFF0F766E),
                                  ),
                                  onPressed: () {
                                    setState(() {
                                      _isMockGpsActive = true;
                                      _latitude = 40.9901;
                                      _longitude = 29.0289;
                                      _locationStatus =
                                          'Simüle Konum (Kadıköy)';
                                      _initializeDangerZones(40.9901, 29.0289);
                                    });
                                    _checkGeofences(40.9901, 29.0289);
                                  },
                                ),
                              ],
                            ),
                          ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // GPS Simülasyonu (Test Paneli)
            if (_dangerZones.isNotEmpty)
              Card(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(
                            Icons.gps_fixed,
                            color: Color(0xFF0F766E),
                            size: 20,
                          ),
                          const SizedBox(width: 8),
                          const Text(
                            'GPS Simülasyonu (Test Paneli)',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                            ),
                          ),
                          const Spacer(),
                          if (_isMockGpsActive)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: const Color(
                                  0xFFF59E0B,
                                ).withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: const Text(
                                'SİMÜLE',
                                style: TextStyle(
                                  color: Color(0xFFD97706),
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: _isMockGpsActive
                                  ? const Color(0xFF475569)
                                  : Colors.grey[200],
                              foregroundColor: _isMockGpsActive
                                  ? Colors.white
                                  : Colors.grey[600],
                              elevation: 0,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 8,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                            icon: const Icon(Icons.gps_not_fixed, size: 14),
                            onPressed: _isMockGpsActive
                                ? () {
                                    setState(() {
                                      _isMockGpsActive = false;
                                    });
                                    _refreshLocation();
                                  }
                                : null,
                            label: const Text(
                              'Gerçek GPS',
                              style: TextStyle(fontSize: 11),
                            ),
                          ),
                          ..._dangerZones.map((zone) {
                            final isCurrent =
                                _currentActiveZoneQr == zone.qrCode;
                            return ElevatedButton.icon(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: isCurrent
                                    ? zone.color
                                    : zone.color.withValues(alpha: 0.1),
                                foregroundColor: isCurrent
                                    ? Colors.white
                                    : zone.color,
                                side: BorderSide(color: zone.color, width: 1.2),
                                elevation: 0,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 8,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(8),
                                ),
                              ),
                              icon: Icon(
                                zone.qrCode == 'ZONE-CHEM-001'
                                    ? Icons.science_outlined
                                    : zone.qrCode == 'ZONE-FORK-001'
                                    ? Icons.warehouse_outlined
                                    : Icons.construction_outlined,
                                size: 14,
                              ),
                              onPressed: () {
                                setState(() {
                                  _isMockGpsActive = true;
                                  _latitude = zone.center.latitude;
                                  _longitude = zone.center.longitude;
                                  _locationStatus = 'Simüle: ${zone.name}';
                                });
                                _checkGeofences(
                                  zone.center.latitude,
                                  zone.center.longitude,
                                );
                              },
                              label: Text(
                                zone.name,
                                style: const TextStyle(fontSize: 11),
                              ),
                            );
                          }),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 12),

            if (_message != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Text(
                  _message!,
                  style: const TextStyle(
                    color: Color(0xFF0F766E),
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            Row(
              children: [
                Expanded(
                  child: PrimaryButton(
                    label: 'Vardiya Başlat',
                    icon: Icons.play_arrow,
                    isLoading: _isBusy,
                    onPressed: hasActiveShift ? null : _startShift,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: PrimaryButton(
                    label: 'Vardiya Durdur',
                    icon: Icons.stop,
                    backgroundColor: const Color(0xFF475569),
                    isLoading: _isBusy,
                    onPressed: hasActiveShift ? _endShift : null,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _NavigationTile(
              title: 'Simulasyon',
              subtitle: 'Normal, darbe, düşme, pil ve bağlantı senaryoları',
              icon: Icons.science_outlined,
              onTap: () => _open(const DemoSimulationScreen()),
            ),
            _NavigationTile(
              title: 'Acil Durum',
              subtitle: 'Manuel acil durum alarmı gönder',
              icon: Icons.warning_amber_rounded,
              color: const Color(0xFFDC2626),
              onTap: () => _open(const EmergencyScreen()),
            ),
            _NavigationTile(
              title: 'QR Bölge Girişi',
              subtitle: 'Kamera ile tehlikeli bölge QR kodu tara',
              icon: Icons.qr_code_2,
              onTap: () => _open(const ZoneScanScreen()),
            ),
          ],
        ),
      ),
    );
  }
}

class _NavigationTile extends StatelessWidget {
  const _NavigationTile({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.onTap,
    this.color = const Color(0xFF0F766E),
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final VoidCallback onTap;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: color.withValues(alpha: 0.12),
          child: Icon(icon, color: color),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}

class LocalDangerZone {
  final String name;
  final String qrCode;
  final String riskLevel;
  final LatLng center;
  final double radius;
  final Color color;

  LocalDangerZone({
    required this.name,
    required this.qrCode,
    required this.riskLevel,
    required this.center,
    required this.radius,
    required this.color,
  });
}
