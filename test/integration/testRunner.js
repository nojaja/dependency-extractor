// test/integration/testRunner.js
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { DependencyExtractorApp } from '../../src/index.js';
import log4js from 'log4js';

// ロガー設定
log4js.configure({
  appenders: {
    console: { type: 'console' }
  },
  categories: {
    default: { appenders: ['console'], level: 'info' }
  }
});

const logger = log4js.getLogger('testRunner');

/**
 * 統合テストを実行する関数
 */
async function runIntegrationTest() {
  try {
    logger.info('統合テストを開始します...');
    
    // テストディレクトリのパス
    const testFixturesDir = path.resolve('test/integration/fixtures');
    const outputPath = path.resolve('test/integration/dependencies-test.csv');
    
    // テスト用アプリケーションの設定
    const app = new DependencyExtractorApp({
      debug: true,
      outputPath
    });
    
    // テスト実行
    await app.run(testFixturesDir);
    
    // 結果の検証
    if (existsSync(outputPath)) {
      const content = await fs.readFile(outputPath, 'utf8');
      logger.info('テスト出力:\n' + content);
      logger.info('テストが正常に完了しました。');
    } else {
      throw new Error('出力ファイルが生成されませんでした。');
    }
  } catch (error) {
    logger.error(`テスト実行中にエラーが発生しました: ${error.message}`);
    process.exit(1);
  }
}

// テスト実行
runIntegrationTest();
