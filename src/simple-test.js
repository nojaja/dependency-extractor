console.log('シンプルテストを開始');

async function main() {
  console.log('メイン関数を実行中');
  try {
    // ProjectDetectorのモジュールパスを確認
    const projectDetectorPath = './detectors/projectDetector.js';
    console.log(`ProjectDetector モジュールのパス: ${projectDetectorPath}`);
    
    // モジュールをインポート
    console.log('モジュールをインポート中...');
    const projectDetectorModule = await import(projectDetectorPath).catch(err => {
      console.error(`インポートエラー: ${err.message}`);
      console.error(err.stack);
      return null;
    });
    
    if (!projectDetectorModule) {
      console.error('モジュールのインポートに失敗しました');
      return;
    }
    
    console.log('モジュールを正常にインポートしました');
    console.log('利用可能なエクスポート:', Object.keys(projectDetectorModule));
    
    // ProjectDetectorクラスを取り出す
    const { ProjectDetector } = projectDetectorModule;
    
    if (!ProjectDetector) {
      console.error('ProjectDetectorクラスが見つかりません');
      return;
    }
    
    console.log('ProjectDetectorクラスを取得しました');
    
    // インスタンスを作成
    console.log('ProjectDetectorインスタンスを作成します');
    const detector = new ProjectDetector(true);
    console.log('インスタンス作成成功:', detector);
    
  } catch (err) {
    console.error('予期しないエラーが発生しました:', err);
    console.error(err.stack);
  }
}

// メイン関数を実行
main()
  .then(() => console.log('テスト完了'))
  .catch(err => console.error('メイン関数でエラーが発生しました:', err));

// プロセスの終了を遅らせる
setTimeout(() => {
  console.log('プロセスを終了します');
}, 1000);
