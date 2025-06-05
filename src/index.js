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
      }      // ストリーミング処理用のCSV初期化
      await this.csvHelper.initializeCsv();
      let totalDependencies = 0;
      let totalProjects = 0;

      // プロジェクト処理用のコールバック関数
      const projectCallback = async (project) => {
        totalProjects++;
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
              return;
          }

          if (dependencies.length > 0) {
            // 即座にCSVに書き込み、メモリから解放
            await this.csvHelper.appendDependenciesToCsv(dependencies);
            totalDependencies += dependencies.length;
            logger.info(`${project.type} プロジェクト '${project.relativePath}' から ${dependencies.length} 個の依存関係を処理しました。`);
          } else {
            logger.warn(`${project.type} プロジェクト '${project.relativePath}' から依存関係を抽出できませんでした。`);
          }
          
          // メモリから即座に解放
          dependencies = null;
        } catch (error) {
          logger.error(`プロジェクト '${project.relativePath}' の依存関係抽出中にエラーが発生しました: ${error.message}`);
          if (this.options.debug) {
            logger.debug(error.stack);
          }
          // 個別のプロジェクトのエラーで全体の処理は止めない
        }
      };

      // ストリーミング処理でプロジェクトを検出・処理
      const detectedProjects = await this.projectDetector.detectProjectsStreaming(repoPath, projectCallback);
      
      if (detectedProjects === 0) {
        logger.warn('対象のプロジェクトが見つかりませんでした。');
        return;
      }
      
      logger.info(`${detectedProjects} 個のプロジェクトをストリーミング処理しました。`);

      // CSV出力完了
      if (totalDependencies > 0) {
        const csvPath = await this.csvHelper.finalizeCsv();
        logger.info(`依存関係情報を ${csvPath} に出力しました。合計 ${totalDependencies} 件の依存関係が抽出されました。`);
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
  const startTime = process.hrtime();
  process.on('exit', exitCode => {
    //後始末処理
    const endTimeArray = process.hrtime(startTime);
    const memoryUsage = process.memoryUsage();
    function toMByte(byte) {
      return `${Math.floor((byte / 1024 / 1024) * 100) / 100}MB`
    }
    const _memoryUsage = JSON.stringify({
      "rss": toMByte(memoryUsage.rss),
      "heapTotal": toMByte(memoryUsage.heapTotal),
      "heapUsed": toMByte(memoryUsage.heapUsed),
      "external": toMByte(memoryUsage.external),
      "arrayBuffers": toMByte(memoryUsage.arrayBuffers)
    });
    console.log(`process statistics - Execution time: ${endTimeArray[0]}s ${endTimeArray[1] / 1000000}ms, memoryUsage: ${_memoryUsage}`);
  });
  try {    // コマンドライン引数の解析
    const program = new Command();
    program
      .name('dependency-extractor')
      .description('Gitリポジトリ内からJava、PHP、Node.jsのプロジェクトを検出し、依存関係ライブラリを抽出するツール')
      .version('0.1.0')
      .requiredOption('-i, --input <path>', 'スキャン対象のGitリポジトリパス')
      .option('-o, --output <path>', '出力CSVファイルのパス', 'dependencies.csv')
      .option('-d, --debug', 'デバッグモード', false)
      .parse(process.argv);

    const options = program.opts();
    const repoPath = options.input;

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

// CLIツールとして実行
main();

// テストなどからインポート可能にするためにエクスポート
export { DependencyExtractorApp };
