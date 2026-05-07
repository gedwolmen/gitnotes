import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Modal } from './ui';

let speechModule: {
  start: (opts: Record<string, unknown>) => Promise<void>;
  stop: () => void;
  requestPermissionsAsync: () => Promise<{ status: string }>;
} | null = null;
let speechEventHook: ((event: string, handler: (...args: any[]) => void) => void) | null = null;

try {
  const mod = require('expo-speech-recognition');
  speechModule = mod.ExpoSpeechRecognitionModule;
  speechEventHook = mod.useSpeechRecognitionEvent;
} catch (error) { void error;
  speechModule = null;
  speechEventHook = null;
}

const noOpHook = (_event: string, _handler: (...args: any[]) => void) => {};

function useSpeechEvents(
  onResult: (results: Array<{ transcript: string; isFinal: boolean }>) => void,
  onError: (error: string, message?: string) => void,
  onEnd: () => void,
) {
  const hook = speechEventHook || noOpHook;
  hook('result', (evt: any) => onResult(evt.results || []));
  hook('error', (evt: any) => onError(evt.error, evt.message));
  hook('end', () => onEnd());
}

interface VoiceInputModalProps {
  visible: boolean;
  onDone: (text: string) => void;
  onClose: () => void;
}

export default function VoiceInputModal({ visible, onDone, onClose }: VoiceInputModalProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(speechModule !== null);
  const startedRef = useRef(false);

  useSpeechEvents(
    (results) => {
      const text = results[0]?.transcript || '';
      if (results[0]?.isFinal) {
        setTranscript((prev) => prev + text);
        setInterim('');
      } else {
        setInterim(text);
      }
    },
    (err, msg) => {
      if (err === 'no-speech') return;
      setError(msg || err);
      setIsListening(false);
    },
    () => setIsListening(false),
  );

  const stopListening = useCallback(() => {
    if (startedRef.current && speechModule) {
      try {
        speechModule.stop();
      } catch (error) { void error;
        // Module may throw if not currently listening
      }
      startedRef.current = false;
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(async () => {
    if (!speechModule) {
      setError('Speech recognition not available on this device');
      setAvailable(false);
      return;
    }
    try {
      setError(null);
      const { status } = await speechModule.requestPermissionsAsync();
      if (status !== 'granted') {
        setError('Microphone permission denied');
        setAvailable(false);
        return;
      }
      await speechModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: true,
      });
      setIsListening(true);
      startedRef.current = true;
    } catch (error) { void error;
      setError('Speech recognition not available on this device');
      setAvailable(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setTranscript('');
      setInterim('');
      setError(null);
      if (!speechModule) {
        setAvailable(false);
        setError('Speech recognition not available on this device');
        return;
      }
      speechModule.requestPermissionsAsync()
        .then((result) => {
          if (result.status !== 'granted') {
            setError('Microphone permission denied');
            setAvailable(false);
          } else {
            setAvailable(true);
          }
        })
        .catch(() => {
          setAvailable(false);
          setError('Speech recognition not available');
        });
    } else {
      stopListening();
    }
  }, [visible, stopListening]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const handleInsert = useCallback(() => {
    stopListening();
    const fullText = (transcript + interim).trim();
    if (fullText) {
      onDone(fullText);
    } else {
      onClose();
    }
  }, [transcript, interim, onDone, onClose, stopListening]);

  const handleCancel = useCallback(() => {
    stopListening();
    onClose();
  }, [onClose, stopListening]);

  if (!speechModule) {
    return (
      <Modal
        visible={visible}
        onRequestClose={onClose}
        fullWidth
        contentStyle={styles.modalContent}
      >
        <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity testID="voice-input-modal.button.close-unavailable" onPress={onClose} style={styles.headerBtn}>
              <Text style={styles.headerBtnText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Voice Input</Text>
            <View style={styles.headerBtn} />
          </View>
          <View style={styles.body}>
            <Ionicons name="mic-off-outline" size={64} color="#8e8e93" />
            <Text style={styles.statusText}>Speech recognition not available on this device</Text>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      onRequestClose={handleCancel}
      fullWidth
      contentStyle={styles.modalContent}
    >
      <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity testID="voice-input-modal.button.close" onPress={handleCancel} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Voice Input</Text>
          <TouchableOpacity testID="voice-input-modal.button.done" onPress={handleInsert} style={styles.headerBtn}>
            <Text style={[styles.headerBtnText, styles.insertBtn]}>Insert</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          <TouchableOpacity
            style={[styles.micBtn, isListening && styles.micBtnActive]}
            onPress={toggleListening}
            disabled={!available}
            activeOpacity={0.7}
          >
            {isListening ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : (
              <Ionicons name="mic" size={44} color="#fff" />
            )}
          </TouchableOpacity>

          <Text style={styles.statusText}>
            {!available
              ? 'Speech recognition not available'
              : error
                ? error
                : isListening
                  ? 'Listening…'
                  : transcript
                    ? 'Paused — tap to continue'
                    : 'Tap to speak'}
          </Text>

          <ScrollView style={styles.transcriptBox} contentContainerStyle={styles.transcriptContent}>
            <Text style={styles.transcriptText}>
              {transcript}
              <Text style={styles.interimText}>{interim}</Text>
            </Text>
            {!transcript && !interim && (
              <Text style={styles.placeholder}>Your speech will appear here…</Text>
            )}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    padding: 0,
    width: '100%',
    height: '80%',
  },
  container: { flex: 1, backgroundColor: '#1c1c1e' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3a3a3c',
  },
  headerBtn: { paddingHorizontal: 8, paddingVertical: 4, minWidth: 60 },
  headerBtnText: { fontSize: 16, color: '#8e8e93' },
  insertBtn: { color: '#007AFF', fontWeight: '600', textAlign: 'right' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#fff' },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 24,
  },
  micBtn: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnActive: {
    backgroundColor: '#FF3B30',
  },
  statusText: {
    fontSize: 15,
    color: '#8e8e93',
    textAlign: 'center',
  },
  transcriptBox: {
    width: '100%',
    maxHeight: 180,
    backgroundColor: '#2c2c2e',
    borderRadius: 12,
  },
  transcriptContent: {
    padding: 14,
  },
  transcriptText: {
    fontSize: 17,
    lineHeight: 25,
    color: '#fff',
  },
  interimText: {
    color: '#8e8e93',
  },
  placeholder: {
    fontSize: 17,
    color: '#636366',
  },
});
