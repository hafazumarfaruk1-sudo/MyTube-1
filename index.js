// একদম ১ নম্বর লাইনে এই ফিক্স থাকতে হবে (কোনো import-এর আগে)
if (!global.MessageQueue) {
  global.MessageQueue = { spy: () => {} };
}

import 'react-native-reanimated';
import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { registerRootComponent } from 'expo';
import App from './App';

// ১. রিয়্যাক্ট এরর বাউন্ডারি (স্ক্রিনে পুরো এরর দেখানোর জন্য)
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#8B0000', paddingTop: 50, padding: 20 }}>
          <Text style={{ fontSize: 24, color: 'white', fontWeight: 'bold' }}>App Crashed!</Text>
          <Text style={{ fontSize: 16, color: 'white', marginVertical: 10 }}>
            নিচের সম্পূর্ণ লগটি পড়ুন বা স্ক্রিনশট নিন:
          </Text>
          <ScrollView style={{ backgroundColor: 'black', padding: 10, borderRadius: 5 }}>
            <Text style={{ color: '#00FF00', fontSize: 13 }}>
              {this.state.error ? `${this.state.error.message}\n\n${this.state.error.stack}` : 'Unknown Error'}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

global.ErrorUtils.setGlobalHandler((error, isFatal) => {
  if (isFatal) {
    alert(`🔴 Fatal Error:\n${error.message}\n\n${error.stack}`);
  }
});

const MyTubeRoot = () => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

registerRootComponent(MyTubeRoot);
