import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { Command } from 'commander';
import log4js from 'log4js';

// 内部モジュールのインポート
import { ProjectDetector, ProjectType } from './detectors/projectDetector.js';
import { NpmExtractor } from './extractors/npmExtractor.js';
import { MavenExtractor } from './extractors/mavenExtractor.js';
import { GradleExtractor } from './extractors/gradleExtractor.js';
import { ComposerExtractor } from './extractors/composerExtractor.js';
import { CsvHelper } from './utils/csvHelper.js';

// ロガーの設定
log4js.configure({
  appenders: {
    console: { type: 'console' }
  },
  categories: {
    default: { appenders: ['console'], level: 'info' }
  }
});

const logger = log4js.getLogger('index');

/**
 * メインのアプリケーションクラス
 */
class DependencyExtractorApp {
  /**
   * コンストラクタ
   * @param {Object} options - アプリケーション設定オプション
   */
  constructor(options = {}) {
    this.options = {
      debug: options.debug || false,
      outputPath: options.outputPath || 'dependencies.csv'
    };

    // コンポーネントの初期化
    this.projectDetector = new ProjectDetector(this.options.debug);
    this.npmExtractor = new NpmExtractor(this.options.debug);
    this.mavenExtractor = new MavenExtractor(this.options.debug);
    this.gradleExtractor = new GradleExtractor(this.options.debug);
    this.composerExtractor = new ComposerExtractor(this.options.debug);
    this.csvHelper = new CsvHelper(this.options.outputPath, this.options.debug);
  }

  /**
   * 依存関係抽出処理のエントリーポイント
   * @param {string} repoPath - 対象リポジトリのパス
   * @returns {Promise<void>}
   */
  async run(repoPath) {
    try {
      logger.info('依存関係抽出ツールを開始します...');
      logger.info(`対象リポジトリ: ${repoPath}`);
      
      // リポジトリが存在するか確認
      if (!existsSync(repoPath)) {
        throw new Error(`指定されたパス '${repoPath}' は存在しません。`);
      }
      
      // プロジェクトの検出
      const projects = await this.projectDetector.detectProjects(repoPath);
      logger.info(`${projects.length} 個のプロジェクトが検出されました。`);
      
      if (projects.length === 0) {
        logger.warn('対象のプロジェクトが見つかりませんでした。');
        return;
      }
      
      // 各プロジェクトから依存関係を抽出
      const allDependencies = [];
      
      for (const project of projects) {
        try {
          let dependencies = [];
          
          switch (project.type) {
            case ProjectType.NPM:
              dependencies = await this.npmExtractor.extractDependencies(
                project.path, 
                project.relativePath
              );
              break;
            case ProjectType.MAVEN:
              dependencies = await this.mavenExtractor.extractDependencies(
                project.path, 
                project.relativePath
              );
              break;
            case ProjectType.GRADLE:
              dependencies = await this.gradleExtractor.extractDependencies(
                project.path, 
                project.relativePath
              );
              break;
            case ProjectType.COMPOSER:
              dependencies = await this.composerExtractor.extractDependencies(
                project.path, 
                project.relativePath
              );
              break;
            default:
              logger.warn(`未対応のプロジェクトタイプ: ${project.type}`);
              continue;
          }
          
          if (dependencies.length > 0) {
            allDependencies.push(...dependencies);
            logger.info(`${project.type} プロジェクト '${project.relativePath}' から ${dependencies.length} 個の依存関係を抽出しました。`);
          } else {
            logger.warn(`${project.type} プロジェクト '${project.relativePath}' から依存関係を抽出できませんでした。`);
          }
        } catch (error) {
          logger.error(`プロジェクト '${project.relativePath}' の依存関係抽出中にエラーが発生しました: ${error.message}`);
          if (this.options.debug) {
            logger.debug(error.stack);
          }
          // 個別のプロジェクトのエラーで全体の処理は止めない
          continue;
        }
      }
      
      // CSV出力
      if (allDependencies.length > 0) {
        const csvPath = await this.csvHelper.writeDependenciesToCsv(allDependencies);
        logger.info(`依存関係情報を ${csvPath} に出力しました。合計 ${allDependencies.length} 件の依存関係が抽出されました。`);
      } else {
        logger.warn('抽出された依存関係がありませんでした。');
      }
      
      logger.info('処理が完了しました。');
    } catch (error) {
      logger.error(`処理中にエラーが発生しました: ${error.message}`);
      if (this.options.debug) {
        logger.debug(error.stack);
      }
      throw error; // 上位の呼び出し元で処理させるためにスロー
    }
  }
}

/**
 * コマンドライン引数の解析と実行
 */
async function main() {
  try {
    // コマンドライン引数の解析
    const program = new Command();
    program
      .name('dependency-extractor')
      .description('Gitリポジトリ内からJava、PHP、Node.jsのプロジェクトを検出し、依存関係ライブラリを抽出するツール')
      .version('0.1.0')
      .argument('<repositoryPath>', 'スキャン対象のGitリポジトリパス')
      .option('-o, --output <path>', '出力CSVファイルのパス', 'dependencies.csv')
      .option('-d, --debug', 'デバッグモード', false)
      .parse(process.argv);

    const options = program.opts();
    const [repoPath] = program.args;

    // アプリケーションの実行
    const app = new DependencyExtractorApp({
      debug: options.debug,
      outputPath: options.output
    });

    await app.run(repoPath);
  } catch (error) {
    logger.error(`エラーが発生しました: ${error.message}`);
    process.exit(1);
  }
}

// コマンドラインから実行された場合のみmain関数を実行
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// テストなどからインポート可能にするためにエクスポート
export { DependencyExtractorApp };
