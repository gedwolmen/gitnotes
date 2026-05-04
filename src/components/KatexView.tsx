import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { WebViewMessageEvent } from 'react-native-webview';
import { WebView } from 'react-native-webview';

export interface KatexViewProps {
  expression: string;
  displayMode: 'inline' | 'block';
  isDark: boolean;
  onHeightChange?: (height: number) => void;
}

const KATEX_MIN_CSS = 'html,body{margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}#container{display:inline-block;max-width:100%;box-sizing:border-box;padding:0}.katex{display:inline-block;max-width:100%;white-space:normal;word-break:break-word;line-height:1.4}.katex-display{display:block;width:100%;white-space:normal;text-align:center;margin:0}';

const KATEX_MIN_JS = '!function(){function e(e){return e.replace(/[&<>"\']/g,function(e){return{"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","\'":"&#39;"}[e]})}window.katex={render:function(t,n,o){var r=!!(o&&o.displayMode),i=document.createElement(r?"div":"span");i.className=r?"katex-display":"katex",i.innerHTML=e(String(t||"")),n.innerHTML="",n.appendChild(i)}}}();';

function buildHtml(isDark: boolean): string {
  const background = isDark ? '#0f172a' : '#ffffff';
  const text = isDark ? '#e5e7eb' : '#111827';

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      body{background:${background};color:${text};overflow:hidden;}
      ${KATEX_MIN_CSS}
    </style>
  </head>
  <body>
    <div id="container"></div>
    <script>${KATEX_MIN_JS}</script>
    <script>window.__katexReady=typeof katex!=="undefined"&&typeof katex.render==="function";</script>
  </body>
</html>`;
}

function buildInjectedJavaScript(expression: string, displayMode: boolean): string {
  return `(function(){var container=document.getElementById('container');if(!container||!window.katex||typeof window.katex.render!=='function'){window.ReactNativeWebView.postMessage('0');return true;}katex.render(${JSON.stringify(expression)},container,{displayMode: ${displayMode}, throwOnError: false});var height=Math.ceil(container.offsetHeight||document.body.scrollHeight||0);window.ReactNativeWebView.postMessage(String(height));return true;})();`;
}

export default function KatexView({ expression, displayMode, isDark, onHeightChange }: KatexViewProps) {
  const html = useMemo(() => buildHtml(isDark), [isDark]);
  const injectedJavaScript = useMemo(
    () => buildInjectedJavaScript(expression, displayMode === 'block'),
    [displayMode, expression],
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const height = Number(event.nativeEvent.data);

      if (Number.isFinite(height)) {
        onHeightChange?.(height);
      }
    },
    [onHeightChange],
  );

  return (
    <View style={styles.container}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        injectedJavaScript={injectedJavaScript}
        onMessage={handleMessage}
        javaScriptEnabled
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        automaticallyAdjustContentInsets={false}
        nestedScrollEnabled={false}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
  },
  webview: {
    backgroundColor: 'transparent',
    alignSelf: 'stretch',
  },
});
