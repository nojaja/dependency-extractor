import path from 'path';
import fs from 'fs';
import { ProjectDetector } from './detectors/projectDetector.js';

console.log('テストプログラムを開始します...');

// テスト関数
async function testProjectDetection() {
  try {
    console.log('プロジェクト検出テストを開始します');
    
    // テストディレクトリのパス
    const testPath = path.resolve('test/integration/fixtures');
    console.log(`テストパス: ${testPath}`);
    
    // パスが存在するか確認
    if (!fs.existsSync(testPath)) {
      console.error(`テストパス ${testPath} は存在しません`);
      return;
    }
    
    // ディレクトリ内容を表示
    const files = fs.readdirSync(testPath);
    console.log('テストディレクトリの内容:', files);
    
    // ProjectDetector をインスタンス化
    console.log('ProjectDetector を作成します...');
    const detector = new ProjectDetector(true);
    
    // プロジェクト検出を実行
    console.log('プロジェクト検出を実行します...');
    const projects = await detector.detectProjects(testPath);
    
    // 結果を表示
    console.log(`検出されたプロジェクト数: ${projects.length}`);
    projects.forEach((project, index) => {
      console.log(`\nプロジェクト ${index + 1}:`);
      console.log(`  タイプ: ${project.type}`);
      console.log(`  パス: ${project.path}`);
      console.log(`  ファイル: ${project.file}`);
      console.log(`  相対パス: ${project.relativePath}`);
    });
    
  } catch (error) {
    console.error('テスト中にエラーが発生しました:', error);
    console.error(error.stack);
  }
}

// テストを実行
testProjectDetection();
