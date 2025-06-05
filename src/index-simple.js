/**
 * 依存関係抽出ツールのシンプルバージョン
 * このファイルはより単純なアプローチで依存関係を抽出するためのものです
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// __dirnameを取得するためのワークアラウンド
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// メインロジック
console.log('依存関係抽出ツール - シンプルバージョン');
console.log('------------------------------------');

// コマンドライン引数の解析
const args = process.argv.slice(2);

// オプション解析
let repoPath = null;
let debug = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-i' || args[i] === '--input') {
    if (i + 1 < args.length) {
      repoPath = args[i + 1];
      i++; // 次の引数をスキップ
    } else {
      console.error('エラー: -i オプションにはパスを指定してください。');
      process.exit(1);
    }
  } else if (args[i] === '--debug') {
    debug = true;
  }
}

if (!repoPath) {
  console.error('使用方法: node index-simple.js -i <リポジトリパス> [--debug]');
  process.exit(1);
}

// リポジトリパスの検証
if (!fs.existsSync(repoPath)) {
  console.error(`エラー: 指定されたパス '${repoPath}' は存在しません。`);
  process.exit(1);
}

console.log(`対象リポジトリ: ${repoPath}`);
console.log(`デバッグモード: ${debug ? 'オン' : 'オフ'}\n`);

// プロジェクト定義ファイルを検索
const projectFiles = {
  'Maven': ['pom.xml'],
  'Gradle': ['build.gradle', 'build.gradle.kts'],
  'Composer': ['composer.json'],
  'NPM': ['package.json']
};

const foundProjects = [];

// リポジトリ内を再帰的に検索
function walkDir(dir, relative = '') {
  try {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const currentPath = path.join(dir, file);
      const currentRelative = path.join(relative, file);
      
      if (fs.statSync(currentPath).isDirectory()) {
        // シンボリックリンクの場合はスキップ
        if (fs.lstatSync(currentPath).isSymbolicLink()) {
          if (debug) console.log(`シンボリックリンクをスキップ: ${currentPath}`);
          continue;
        }
        
        // 再帰的に処理
        walkDir(currentPath, currentRelative);
      } else {
        // プロジェクトタイプをチェック
        for (const [type, typeFiles] of Object.entries(projectFiles)) {
          if (typeFiles.includes(file)) {
            console.log(`検出: ${type} プロジェクト - ${currentRelative}`);
            
            foundProjects.push({
              type,
              path: dir,
              file,
              relativePath: currentRelative
            });
          }
        }
      }
    }
  } catch (error) {
    console.error(`エラー: ${dir} の処理中にエラーが発生しました - ${error.message}`);
  }
}

// ディレクトリ探索を実行
console.log('リポジトリ内のプロジェクトを探索中...');
walkDir(repoPath);

// 結果表示
console.log(`\n検出されたプロジェクト: ${foundProjects.length} 件`);

if (foundProjects.length === 0) {
  console.log('対象のプロジェクトが見つかりませんでした。');
} else {
  // 各プロジェクトの情報を表示
  foundProjects.forEach((project, index) => {
    console.log(`\n[${index + 1}] ${project.type} プロジェクト`);
    console.log(`  ファイル: ${project.relativePath}`);
    console.log(`  パス: ${project.path}`);
    
    try {
      // プロジェクトファイルの内容を読み取り
      const content = fs.readFileSync(path.join(project.path, project.file), 'utf8');
      
      switch (project.type) {
        case 'NPM': {
          const packageData = JSON.parse(content);
          console.log(`  名前: ${packageData.name || '不明'}`);
          console.log(`  バージョン: ${packageData.version || '不明'}`);
          
          // 依存関係の表示
          console.log('  依存関係:');
          const deps = packageData.dependencies || {};
          Object.entries(deps).forEach(([name, version]) => {
            console.log(`    - ${name}: ${version}`);
          });
          break;
        }
        
        case 'Maven':
          console.log('  Maven プロジェクトの依存関係抽出には mvn コマンドの実行が必要です');
          break;
          
        case 'Gradle':
          console.log('  Gradle プロジェクトの依存関係抽出には gradle コマンドの実行が必要です');
          break;
          
        case 'Composer': {
          const composerData = JSON.parse(content);
          console.log(`  名前: ${composerData.name || '不明'}`);
          
          // 依存関係の表示
          console.log('  依存関係:');
          const deps = composerData.require || {};
          Object.entries(deps).forEach(([name, version]) => {
            console.log(`    - ${name}: ${version}`);
          });
          break;
        }
      }
    } catch (error) {
      console.error(`  依存関係の抽出中にエラーが発生しました: ${error.message}`);
    }
  });
  
  // CSV出力用のデータ生成
  const csvData = [['ProjectType', 'ProjectPath', 'DependencyName', 'DependencyVersion']];
  
  foundProjects.forEach(project => {
    try {
      const content = fs.readFileSync(path.join(project.path, project.file), 'utf8');
      
      switch (project.type) {
        case 'NPM': {
          const packageData = JSON.parse(content);
          const deps = packageData.dependencies || {};
          Object.entries(deps).forEach(([name, version]) => {
            csvData.push([project.type, project.relativePath, name, version]);
          });
          break;
        }
        
        case 'Composer': {
          const composerData = JSON.parse(content);
          const deps = composerData.require || {};
          Object.entries(deps).forEach(([name, version]) => {
            if (name !== 'php') { // PHPバージョンは除外
              csvData.push([project.type, project.relativePath, name, version]);
            }
          });
          break;
        }
        
        // Maven と Gradle は実装が複雑なため、このシンプル版では省略
      }
    } catch (error) {
      console.error(`${project.relativePath} のCSV生成中にエラーが発生しました: ${error.message}`);
    }
  });
  
  // CSV出力
  if (csvData.length > 1) {
    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const outputPath = 'dependencies-simple.csv';
    
    try {
      fs.writeFileSync(outputPath, csvContent, 'utf8');
      console.log(`\nCSVファイルを出力しました: ${outputPath}`);
    } catch (error) {
      console.error(`CSV出力中にエラーが発生しました: ${error.message}`);
    }
  }
}

console.log('\n処理が完了しました。');
