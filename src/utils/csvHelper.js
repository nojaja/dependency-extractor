import { stringify } from 'csv-stringify/sync';
import * as fs from 'fs/promises';
import * as path from 'path';
import log4js from 'log4js';

const logger = log4js.getLogger('csvHelper');

/**
 * CSVファイル出力ヘルパークラス
 */
export class CsvHelper {
  /**
   * コンストラクタ
   * @param {string} outputPath - CSV出力先のパス
   * @param {boolean} debug - デバッグモードフラグ
   */
  constructor(outputPath, debug = false) {
    const outputDir = path.dirname(outputPath);
    this.outputPath = path.join(outputDir, 'dependencies.csv');
    this.debug = debug;
    this.initialized = false;
    
    // CSVヘッダー
    this.headers = ['ProjectType', 'ProjectPath', 'DependencyName', 'DependencyVersion'];
  }

  /**
   * ストリーミング処理用のCSV初期化（ヘッダーのみ書き込み）
   * @returns {Promise<void>}
   */
  async initializeCsv() {
    try {
      // 出力ディレクトリの作成
      const outputDir = path.dirname(this.outputPath);
      await fs.mkdir(outputDir, { recursive: true });
      
      // ヘッダーのみを書き込み
      const headerCsv = stringify([this.headers]);
      await fs.writeFile(this.outputPath, headerCsv, 'utf8');
      
      this.initialized = true;
      if (this.debug) {
        logger.debug(`CSVファイルを初期化しました: ${this.outputPath}`);
      }
    } catch (error) {
      logger.error(`CSV初期化エラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * 依存関係データをCSVファイルに追記する（ストリーミング処理）
   * @param {Array<Object>} dependencies - 依存関係情報の配列
   * @returns {Promise<void>}
   */
  async appendDependenciesToCsv(dependencies) {
    try {
      if (!this.initialized) {
        throw new Error('CSV初期化が必要です。先にinitializeCsv()を呼び出してください。');
      }

      if (!Array.isArray(dependencies) || dependencies.length === 0) {
        return; // 空の場合は何もしない
      }

      // 依存関係データをCSV行に変換
      const csvRows = [];
      for (const dep of dependencies) {
        const row = [
          dep.projectType || '',
          dep.projectPath || '',
          dep.dependencyName || '',
          dep.dependencyVersion || ''
        ];
        csvRows.push(row);
      }

      // CSV形式に変換（ヘッダーなし）
      const csvContent = stringify(csvRows);

      // ファイルに追記
      await fs.appendFile(this.outputPath, csvContent, 'utf8');
      
      if (this.debug) {
        logger.debug(`${dependencies.length} 件の依存関係をCSVに追記しました`);
      }
    } catch (error) {
      logger.error(`CSV追記エラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * ストリーミング処理の完了処理
   * @returns {Promise<string>} - 出力したCSVファイルのパス
   */
  async finalizeCsv() {
    if (!this.initialized) {
      throw new Error('CSV初期化が行われていません。');
    }
    
    logger.info(`CSVファイルの出力が完了しました: ${this.outputPath}`);
    return this.outputPath;
  }

  /**
   * 依存関係の情報をCSVとして出力する
   * @param {Array<Object>} dependencies - 依存関係情報の配列
   * @returns {Promise<string>} - 出力したCSVファイルのパス
   */
  async writeDependenciesToCsv(dependencies) {
    try {
      if (this.debug) {
        logger.debug(`${dependencies.length} 件の依存関係をCSV形式に変換中`);
      }

      // データが配列でない場合やempty arrayの場合は空のCSVを返す
      if (!Array.isArray(dependencies) || dependencies.length === 0) {
        logger.warn('依存関係データが空です。空のCSVを生成します。');
        dependencies = [];
      }

      // CSVデータの準備
      const csvData = [this.headers];
      
      // 各依存関係をCSV行に変換
      for (const dep of dependencies) {
        // すべてのフィールドが存在するか確認
        const row = [
          dep.projectType || '',
          dep.projectPath || '',
          dep.dependencyName || '',
          dep.dependencyVersion || ''
        ];
        csvData.push(row);
      }

      // CSV形式に変換
      const csvContent = stringify(csvData);

      // 出力パスの確認
      const outputDir = path.dirname(this.outputPath);
      try {
        // ディレクトリが存在するか確認し、なければ作成
        await fs.mkdir(outputDir, { recursive: true });
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
      }

      // CSVファイルに書き込み
      await fs.writeFile(this.outputPath, csvContent, 'utf8');
      logger.info(`CSVファイルを出力しました: ${this.outputPath}`);
      
      return this.outputPath;
    } catch (error) {
      logger.error(`CSV出力エラー: ${error.message}`);
      throw error;
    }
  }
}

export default CsvHelper;
