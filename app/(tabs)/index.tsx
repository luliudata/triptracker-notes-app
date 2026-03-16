import { View, StyleSheet } from 'react-native';
import App from '../../App';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <App />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
