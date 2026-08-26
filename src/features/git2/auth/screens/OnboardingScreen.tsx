/**
 * OnboardingScreen — initial setup for GitSync client.
 *
 * Guides user through adding a host and cloning their first repository.
 *
 * GPL-3.0 derivative of GitSync.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
} from 'react-native';
import { useAuthStore } from '../authStore';
import { useRepoStore } from '../../repositories/repoStore';

type OnboardingStep = 'host' | 'auth' | 'repo' | 'cloning';

export function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<OnboardingStep>('host');
  const [hostUrl, setHostUrl] = useState('');
  const [authMethod, setAuthMethod] = useState<'https_token' | 'ssh_key'>('https_token');
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [cloning, setCloning] = useState(false);

  const addCredentials = useAuthStore((s) => s.addCredentials);

  async function handleAddHost() {
    if (!hostUrl.trim()) return;
    setStep('auth');
  }

  async function handleAuthenticate() {
    if (!username.trim() || !token.trim()) return;
    try {
      if (authMethod === 'https_token') {
        await addCredentials({ type: 'https_token', host: hostUrl, username, token });
      } else {
        await addCredentials({ type: 'ssh_key', host: hostUrl, username: username || 'git', publicKey: '', privateKey: '', passphrase: '' });
      }
      setStep('repo');
    } catch (e: unknown) {
      Alert.alert('Auth failed', (e as Error).message);
    }
  }

  async function handleClone() {
    if (!repoUrl.trim()) return;
    setCloning(true);
    try {
      const cred = {
        kind: (authMethod === 'https_token' ? 'userpass' : 'sshKey') as 'userpass' | 'sshKey',
        username,
        token,
      };
      const localPath = `/tmp/git2rs/${Date.now()}`;
      const cloneRepository = useRepoStore.getState().cloneRepository;
      await cloneRepository(repoUrl, localPath, cred);
      Alert.alert('Success', 'Repository cloned successfully');
      onComplete();
    } catch (e: unknown) {
      Alert.alert('Clone failed', (e as Error).message);
    } finally {
      setCloning(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>GitSync Setup</Text>
      {step === 'host' && (
        <>
          <Text style={styles.label}>Git Host URL</Text>
          <TextInput
            style={styles.input}
            value={hostUrl}
            onChangeText={setHostUrl}
            placeholder="https://github.com"
            autoCapitalize="none"
          />
          <Button title="Continue" onPress={handleAddHost} />
        </>
      )}
      {step === 'auth' && (
        <>
          <Text style={styles.label}>Auth Method</Text>
          <Button
            title="HTTPS Token"
            onPress={() => setAuthMethod('https_token')}
            color={authMethod === 'https_token' ? '#5b7ef4' : '#999'}
          />
          <Button
            title="SSH Key"
            onPress={() => setAuthMethod('ssh_key')}
            color={authMethod === 'ssh_key' ? '#5b7ef4' : '#999'}
          />
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Username or token name"
          />
          <TextInput
            style={styles.input}
            value={token}
            onChangeText={setToken}
            placeholder={authMethod === 'https_token' ? 'Personal Access Token' : 'SSH Key'}
            secureTextEntry
          />
          <Button title="Authenticate" onPress={handleAuthenticate} />
        </>
      )}
      {step === 'repo' && (
        <>
          <Text style={styles.label}>Repository URL</Text>
          <TextInput
            style={styles.input}
            value={repoUrl}
            onChangeText={setRepoUrl}
            placeholder="https://github.com/user/repo.git"
            autoCapitalize="none"
          />
          <Button
            title={cloning ? 'Cloning...' : 'Clone Repository'}
            onPress={handleClone}
            disabled={cloning}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  label: { fontSize: 16, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
});
