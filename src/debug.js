// src/debug.js
// 依存関係抽出ツールの動作確認用デバッグスクリプト
// このスクリプトは各モジュールをロードして基本機能を確認します

import fs from 'fs';
import path from 'path';

// 作業ディレクトリの確認
console.log('作業ディレクトリ:', process.cwd());

// ファイル存在確認
const files = [
  'src/detectors/projectDetector.js',
  'src/extractors/npmExtractor.js',
  'src/extractors/mavenExtractor.js',
  'src/extractors/gradleExtractor.js',
  'src/extractors/composerExtractor.js',
  'src/utils/csvHelper.js',
  'src/utils/dirWalker.js',
  'src/index.js'
];

console.log('ファイル存在チェック:');
for (const file of files) {
  const exists = fs.existsSync(file);
  console.log(`  ${file}: ${exists ? '存在します' : '見つかりません'}`);
}

// モジュールのロードテスト
async function testModuleLoading() {
  try {
    console.log('\nモジュールのインポートテスト:');
    
    console.log('ProjectDetector のインポート...');
    const { ProjectDetector, ProjectType } = await import('./detectors/projectDetector.js');
    console.log('  成功: ProjectDetector クラスを取得しました');
    
    console.log('NpmExtractor のインポート...');
    const { NpmExtractor } = await import('./extractors/npmExtractor.js');
    console.log('  成功: NpmExtractor クラスを取得しました');
    
    console.log('MavenExtractor のインポート...');
    const { MavenExtractor } = await import('./extractors/mavenExtractor.js');
    console.log('  成功: MavenExtractor クラスを取得しました');
    
    console.log('GradleExtractor のインポート...');
    const { GradleExtractor } = await import('./extractors/gradleExtractor.js');
    console.log('  成功: GradleExtractor クラスを取得しました');
    
    console.log('ComposerExtractor のインポート...');
    const { ComposerExtractor } = await import('./extractors/composerExtractor.js');
    console.log('  成功: ComposerExtractor クラスを取得しました');
    
    console.log('CsvHelper のインポート...');
    const { CsvHelper } = await import('./utils/csvHelper.js');
    console.log('  成功: CsvHelper クラスを取得しました');
    
    console.log('DirWalker のインポート...');
    const { DirWalker } = await import('./utils/dirWalker.js');
    console.log('  成功: DirWalker クラスを取得しました');
    
    // ProjectDetector の簡易テスト
    console.log('\nProjectDetector の初期化テスト:');
    const detector = new ProjectDetector(true);
    console.log('  成功: ProjectDetector のインスタンスを作成しました');
    
    // テスト用の簡易リポジトリパス
    const testRepoPath = 'test/integration/fixtures';
    console.log(`\nリポジトリスキャンテスト (${testRepoPath}):`);
    try {
      if (fs.existsSync(testRepoPath)) {
        console.log('  テストディレクトリが存在します、プロジェクト検出を開始...');
        const projects = await detector.detectProjects(testRepoPath);
        console.log(`  検出完了: ${projects.length} 個のプロジェクトを発見しました`);
        console.log('  プロジェクト一覧:');
        projects.forEach((proj, index) => {
          console.log(`    [${index + 1}] タイプ: ${proj.type}, パス: ${proj.relativePath}`);
        });
      } else {
        console.log(`  エラー: テストディレクトリ ${testRepoPath} が見つかりません`);
      }
    } catch (error) {
      console.error('  プロジェクト検出中にエラーが発生しました:', error);
    }
  } catch (error) {
    console.error('モジュールのロード中にエラーが発生しました:', error);
  }
}

// テスト実行
testModuleLoading();
