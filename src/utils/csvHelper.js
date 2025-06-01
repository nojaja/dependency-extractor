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
    this.outputPath = outputPath;
    this.debug = debug;
    
    // CSVヘッダー
    this.headers = ['ProjectType', 'ProjectPath', 'DependencyName', 'DependencyVersion'];
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
