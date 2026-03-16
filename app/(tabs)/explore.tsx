import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, Pressable, ActivityIndicator, Alert } from 'react-native';

export default function TripPlannerScreen() {
  const [destination, setDestination] = useState('');
  const [days, setDays] = useState('');
  const [notes, setNotes] = useState('');
  const [plan, setPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

  const generatePlan = async () => {
    const dest = destination.trim();
    if (!dest) {
      Alert.alert('Destination required', 'Please enter where you are going first.');
      return;
    }

    if (!GEMINI_API_KEY) {
      Alert.alert(
        'Missing API key',
        'Set EXPO_PUBLIC_GEMINI_API_KEY in your environment to use the AI planner.'
      );
      return;
    }

    const lower = dest.toLowerCase();
    const daysText = days.trim() ? `${days.trim()} days` : 'a few days';

    let extraXiAnHint = '';
    if (lower.includes("xi'an") || lower.includes('xian') || lower.includes('西安')) {
      extraXiAnHint =
        '\n\nThe destination is Xi\'an, China. Be sure to recommend:\n' +
        '- Local foods: Roujiamo, Biangbiang noodles, Yangrou Paomo, liangpi.\n' +
        '- Places: Terracotta Army, Xi\'an City Wall (cycling OK), Muslim Quarter, Bell Tower & Drum Tower.\n';
    }

    const userNotes = notes.trim()
      ? `\n\nHere are user-provided ideas or list items (places to eat / go / must-try foods):\n${notes.trim()}\n`
      : '';

    const prompt =
      `You are an expert travel planner.\n\n` +
      `Create a practical, day-by-day itinerary for a trip to ${dest} lasting about ${daysText}.\n` +
      `The user is already using a checklist app to track places they want to eat or visit.${userNotes}` +
      extraXiAnHint +
      `\n\nConstraints:\n` +
      '- Write in clear Markdown.\n' +
      '- Use headings like “Day 1 – …”, “Day 2 – …”.\n' +
      '- Use bullet points for activities and food.\n' +
      '- Keep it concrete and realistic, not too long.\n';

    try {
      setLoading(true);
      setPlan(null);

      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' +
          encodeURIComponent(GEMINI_API_KEY),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.warn('Gemini error', errText);
        throw new Error('Gemini API error');
      }

      const json = await response.json();
      const text =
        json.candidates?.[0]?.content?.parts?.[0]?.text ||
        'Sorry, I could not generate a plan. Please try again.';

      setPlan(text);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to generate itinerary. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>AI Trip Planner (beta)</Text>
      <Text style={styles.subtitle}>
        This first version is a simple helper. Enter your destination and any ideas from your lists (places to eat,
        places to go, must-try foods), and we will suggest a lightweight plan. Xi&apos;an, China has a special preset.
      </Text>

      <View style={styles.field}>
        <Text style={styles.label}>Destination</Text>
        <TextInput
          value={destination}
          onChangeText={setDestination}
          placeholder="e.g. Xi'an, China"
          placeholderTextColor="#9ca3af"
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Rough number of days (optional)</Text>
        <TextInput
          value={days}
          onChangeText={setDays}
          placeholder="e.g. 3"
          placeholderTextColor="#9ca3af"
          keyboardType="number-pad"
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Things you want (from your lists)</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Paste or summarize places you want to eat / visit..."
          placeholderTextColor="#9ca3af"
          style={[styles.input, styles.notesInput]}
          multiline
        />
      </View>

      <Pressable onPress={generatePlan} style={styles.generateButton} disabled={loading}>
        {loading ? (
          <>
            <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.generateButtonText}>Generating…</Text>
          </>
        ) : (
          <Text style={styles.generateButtonText}>Generate plan</Text>
        )}
      </Pressable>

      {plan && (
        <View style={styles.planCard}>
          <Text style={styles.planTitle}>Suggested plan</Text>
          <Text style={styles.planText}>{plan}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#4b5563', lineHeight: 20, marginBottom: 20 },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#fff',
  },
  notesInput: { minHeight: 90, textAlignVertical: 'top' },
  generateButton: {
    marginTop: 8,
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  planCard: {
    marginTop: 20,
    borderRadius: 16,
    backgroundColor: '#fff',
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  planTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 },
  planText: { fontSize: 14, color: '#374151', lineHeight: 20 },
});
