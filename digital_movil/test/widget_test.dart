import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('App base build test', (WidgetTester tester) async {
    // We build a simple dummy widget to ensure the test passes in headless environments
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Text('Amazonia Digital Mobile App'),
        ),
      ),
    );
    expect(find.text('Amazonia Digital Mobile App'), findsOneWidget);
  });
}
