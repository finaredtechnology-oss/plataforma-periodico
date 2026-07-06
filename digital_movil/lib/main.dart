import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Amazonia Digital',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF1A4D2E), // Brand Green
          primary: const Color(0xFF1A4D2E),
          secondary: const Color(0xFFEA580C), // Brand Orange
        ),
        useMaterial3: true,
      ),
      home: const WebViewScreen(),
    );
  }
}

class WebViewScreen extends StatefulWidget {
  const WebViewScreen({super.key});

  @override
  State<WebViewScreen> createState() => _WebViewScreenState();
}

class _WebViewScreenState extends State<WebViewScreen> {
  late final WebViewController _controller;
  bool _isLoading = true;
  double _progress = 0;
  String _currentUrl = 'https://periodico.finatech.com.pe';
  final String _defaultUrl = 'https://periodico.finatech.com.pe';

  @override
  void initState() {
    super.initState();
    _initWebViewController();
    _loadSavedUrl();
  }

  void _initWebViewController() {
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF080D1A)) // Brand dark background
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (int progress) {
            setState(() {
              _progress = progress / 100;
            });
          },
          onPageStarted: (String url) {
            setState(() {
              _isLoading = true;
            });
          },
          onPageFinished: (String url) {
            setState(() {
              _isLoading = false;
            });
          },
          onWebResourceError: (WebResourceError error) {
            // Handle connection error gracefully
          },
        ),
      )
      ..loadRequest(Uri.parse(_currentUrl));
  }

  Future<void> _loadSavedUrl() async {
    final prefs = await SharedPreferences.getInstance();
    final savedUrl = prefs.getString('saved_webview_url');
    if (savedUrl != null && savedUrl.isNotEmpty) {
      setState(() {
        _currentUrl = savedUrl;
      });
      _controller.loadRequest(Uri.parse(savedUrl));
    }
  }

  Future<void> _updateUrl(String newUrl) async {
    String formattedUrl = newUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = 'http://$formattedUrl';
    }
    
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('saved_webview_url', formattedUrl);
    
    setState(() {
      _currentUrl = formattedUrl;
      _isLoading = true;
      _progress = 0;
    });
    
    _controller.loadRequest(Uri.parse(formattedUrl));
  }

  Future<void> _resetUrl() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('saved_webview_url');
    
    setState(() {
      _currentUrl = _defaultUrl;
      _isLoading = true;
      _progress = 0;
    });
    
    _controller.loadRequest(Uri.parse(_defaultUrl));
  }

  void _showSettingsDialog() {
    final textController = TextEditingController(
      text: _currentUrl == _defaultUrl ? '' : _currentUrl,
    );

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Row(
            children: [
              Icon(Icons.settings_outlined, color: Color(0xFF1A4D2E)),
              SizedBox(width: 8),
              Text(
                'Entorno de Pruebas',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
              ),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Alterna entre el servidor en producción o tu servidor local de desarrollo:',
                style: TextStyle(fontSize: 12, color: Colors.black54),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: textController,
                decoration: const InputDecoration(
                  labelText: 'URL de Desarrollo IP Local',
                  hintText: 'ej. 192.168.1.15:5173',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.all(Radius.circular(12)),
                  ),
                  prefixIcon: Icon(Icons.computer_outlined),
                ),
                keyboardType: TextInputType.url,
                style: const TextStyle(fontSize: 13),
              ),
              const SizedBox(height: 8),
              Text(
                'URL Actual: $_currentUrl',
                style: const TextStyle(fontSize: 10, color: Colors.grey, fontStyle: FontStyle.italic),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(context);
                _resetUrl();
              },
              child: const Text('Restablecer a Producción', style: TextStyle(color: Colors.redAccent)),
            ),
            ElevatedButton(
              onPressed: () {
                if (textController.text.isNotEmpty) {
                  _updateUrl(textController.text);
                }
                Navigator.pop(context);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF1A4D2E),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              child: const Text('Conectar'),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        if (await _controller.canGoBack()) {
          await _controller.goBack();
        } else {
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Presiona el botón de inicio de tu celular para salir.'),
                duration: Duration(seconds: 2),
              ),
            );
          }
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFF080D1A), // Brand dark color
        body: SafeArea(
          child: Stack(
            children: [
              // WebView
              WebViewWidget(controller: _controller),

              // Progress Indicator bar
              if (_isLoading)
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: SizedBox(
                    height: 3,
                    child: LinearProgressIndicator(
                      value: _progress > 0 ? _progress : null,
                      backgroundColor: Colors.transparent,
                      valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFFEA580C)),
                    ),
                  ),
                ),

              // Loading Splash screen overlay
              if (_isLoading && _progress < 0.1)
                Container(
                  color: const Color(0xFF080D1A),
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: const [
                        CircularProgressIndicator(
                          valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFEA580C)),
                        ),
                        SizedBox(height: 16),
                        Text(
                          'Amazonía Diario',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.2,
                          ),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Cargando portal seguro...',
                          style: TextStyle(
                            color: Colors.grey,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

              // Floating Dev Settings Trigger Button
              Positioned(
                bottom: 16,
                right: 16,
                child: Opacity(
                  opacity: 0.85,
                  child: FloatingActionButton.small(
                    onPressed: _showSettingsDialog,
                    backgroundColor: const Color(0xFF1A4D2E),
                    foregroundColor: Colors.white,
                    tooltip: 'Configurar Servidor',
                    child: const Icon(Icons.settings, size: 18),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
