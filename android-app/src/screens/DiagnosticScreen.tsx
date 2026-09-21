import {StyleSheet, Text, View} from 'react-native';
import {API_BASE_URL} from '../config/api';
import {FocusableButton} from '../components/FocusableButton';
import {StatusRow} from '../components/StatusRow';
import {useApiDiagnostics} from '../hooks/useApiDiagnostics';
import {useRemoteEvent} from '../hooks/useRemoteEvent';
import {t} from '../i18n';
import {tvPlatform} from '../platform/runtime';

export function DiagnosticScreen() {
  const diagnostics = useApiDiagnostics();
  const lastRemoteEvent = useRemoteEvent();
  const statusText = t(diagnostics.apiStatus);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('title')}</Text>
        <Text style={styles.subtitle}>{t('foundation')}</Text>
      </View>
      <View style={styles.panel}>
        <StatusRow label={t('platform')} value={tvPlatform.displayName} />
        <StatusRow label="Package" value={tvPlatform.packageFormat.toUpperCase()} />
        <StatusRow label={t('api')} value={API_BASE_URL} />
        <StatusRow
          label="Status"
          value={statusText}
          tone={diagnostics.apiStatus === 'connected' ? 'success' : diagnostics.apiStatus === 'error' ? 'error' : 'default'}
        />
        <StatusRow
          label={t('channels')}
          value={diagnostics.channelCount === null ? '-' : String(diagnostics.channelCount)}
        />
        {diagnostics.errorMessage ? <Text style={styles.error}>{diagnostics.errorMessage}</Text> : null}
      </View>
      <Text style={styles.sectionTitle}>{t('focusTest')}</Text>
      <View style={styles.actions}>
        <FocusableButton label={t('reload')} onPress={diagnostics.reload} preferredFocus />
        <FocusableButton label="Focus target A" onPress={() => undefined} />
        <FocusableButton label="Focus target B" onPress={() => undefined} />
      </View>
      <Text style={styles.remoteEvent}>
        {t('lastEvent')}: {lastRemoteEvent || t('noEvent')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#07111c', paddingHorizontal: 48, paddingVertical: 24},
  header: {marginBottom: 16},
  title: {color: '#ffffff', fontSize: 36, fontWeight: '700'},
  subtitle: {color: '#55aef7', fontSize: 18, marginTop: 3},
  panel: {width: '68%', borderLeftWidth: 4, borderLeftColor: '#1487e8', paddingLeft: 18, marginBottom: 16},
  error: {color: '#ff8b8b', fontSize: 16, marginTop: 8},
  sectionTitle: {color: '#ffffff', fontSize: 20, fontWeight: '600', marginBottom: 8},
  actions: {flexDirection: 'row', gap: 18},
  remoteEvent: {color: '#91a3b7', fontSize: 16, marginTop: 12},
});
