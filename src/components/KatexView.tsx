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

const KATEX_VERSION = '0.16.11';

const KATEX_CSS_CDN = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.css`;
const KATEX_JS_CDN = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.js`;

function buildHtml(isDark: boolean): string {
  const background = isDark ? '#0f172a' : '#ffffff';
  const text = isDark ? '#e5e7eb' : '#111827';

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <link rel="stylesheet" href="${KATEX_CSS_CDN}" />
    <style>
      body{background:${background};color:${text};overflow:hidden;margin:0;padding:0}
      #container{display:inline-block;max-width:100%;box-sizing:border-box;padding:2px 4px}
      .katex-display{margin:0}
      .katex-error{color:#cc0000;font-style:italic;font-size:0.9em}
    </style>
  </head>
  <body>
    <div id="container"></div>
    <script src="${KATEX_JS_CDN}"></script>
    <script>window.__katexReady=typeof katex!=="undefined"&&typeof katex.render==="function";</script>
  </body>
</html>`;
}

function buildInjectedJavaScript(expression: string, displayMode: boolean): string {
  return `(function(){
var container=document.getElementById('container');
if(!container){window.ReactNativeWebView.postMessage('0');return true;}
if(!window.katex||typeof window.katex.render!=="function"){
  container.textContent=${JSON.stringify(expression)};
  window.ReactNativeWebView.postMessage(String(Math.ceil(container.offsetHeight||0)));
  return true;
}
try{
  katex.render(${JSON.stringify(expression)},container,{displayMode:${displayMode},throwOnError:false});
}catch(e){
  container.textContent=${JSON.stringify(expression)};
}
var height=Math.ceil(container.offsetHeight||document.body.scrollHeight||0);
window.ReactNativeWebView.postMessage(String(height));
return true;})();`;
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
