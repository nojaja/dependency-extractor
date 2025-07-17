import * as path from 'path';
import log4js from 'log4js';
import { DirWalker } from '../utils/dirWalker.js';

const logger = log4js.getLogger('projectDetector');

/**
 * プロジェクトタイプの定義
 */
export const ProjectType = {
  MAVEN: 'Maven',
  GRADLE: 'Gradle',
  COMPOSER: 'Composer',
  NPM: 'NPM'
};

/**
 * 各プロジェクトタイプの設定ファイル名
 */
export const ProjectFiles = {
  [ProjectType.MAVEN]: ['pom.xml'],
  [ProjectType.GRADLE]: ['build.gradle', 'build.gradle.kts'],
  [ProjectType.COMPOSER]: ['composer.json'],
  [ProjectType.NPM]: ['package.json']
};

/**
 * プロジェクト検出クラス
 * リポジトリ内のプロジェクト定義ファイルを検出する
 */
export class ProjectDetector {
  /**
   * コンストラクタ
   * @param {boolean} debug - デバッグモードを有効にするかどうか
   */
  constructor(debug = false) {
    this.debug = debug;
    this.dirWalker = new DirWalker(debug);
  }

  /**
   * 指定されたディレクトリ内のすべてのプロジェクトを検出する
   * @param {string} repoPath - 検索対象のリポジトリディレクトリパス
   * @returns {Promise<Array<{type: string, path: string, file: string}>>} - 検出されたプロジェクトの配列
   */
  async detectProjects(repoPath) {
    logger.info(`リポジトリのプロジェクトを検索中: ${repoPath}`);
    const projects = [];

    const fileCallback = async (relativePath, settings) => {
      const fileName = path.basename(relativePath);
      const dirPath = path.dirname(path.join(repoPath, relativePath));
      
      // プロジェクトタイプを判定
      for (const [type, files] of Object.entries(ProjectFiles)) {
        if (files.includes(fileName)) {
          if (this.debug) {
            logger.debug(`検出: ${type} プロジェクト - ${relativePath}`);
          }
          
          // プロジェクト情報を追加
          projects.push({
            type,
            path: dirPath,
            file: fileName,
            relativePath
          });
        }
      }
    };

    const errorCallback = (error) => {
      logger.error(`プロジェクト検索中にエラーが発生しました: ${error.message}`);
    };

    // 再帰的にリポジトリを走査
    const processedFiles = await this.dirWalker.walk(repoPath, {}, fileCallback, errorCallback);
    
    logger.info(`処理完了: ${processedFiles} ファイルをスキャン、${projects.length} プロジェクトを検出`);
    return projects;
  }
  /**
   * プロジェクトをストリーミング処理で検出し、発見次第コールバックを実行する
   * @param {string} repoPath - 検索対象のリポジトリディレクトリパス
   * @param {Function} projectCallback - プロジェクト発見時のコールバック関数 (project) => Promise<void>
   * @returns {Promise<number>} - 検出されたプロジェクト数
   */
  async detectProjectsStreaming(repoPath, projectCallback) {
    logger.info(`リポジトリのプロジェクトをストリーミング検索中: ${repoPath}`);
    let projectCount = 0;

    const fileCallback = async (relativePath, settings) => {
      const fileName = path.basename(relativePath);
      const dirPath = path.dirname(path.join(repoPath, relativePath));
      
      // プロジェクトタイプを判定
      for (const [type, files] of Object.entries(ProjectFiles)) {
        if (files.includes(fileName)) {
          if (this.debug) {
            logger.debug(`検出: ${type} プロジェクト - ${relativePath}`);
          }
          
          // プロジェクト情報を作成
          const project = {
            type,
            path: dirPath,
            file: fileName,
            relativePath
          };

          projectCount++;
          
          // 即座にコールバックを実行（メモリに蓄積しない）
          try {
            await projectCallback(project);
          } catch (error) {
            logger.error(`プロジェクト処理中にエラーが発生しました (${relativePath}): ${error.message}`);
            if (this.debug) {
              logger.debug(error.stack);
            }
            // 個別プロジェクトのエラーで全体を止めない
          }
        }
      }
    };

    const errorCallback = (error) => {
      logger.error(`プロジェクト検索中にエラーが発生しました: ${error.message}`);
    };

    // 再帰的にリポジトリを走査
    const processedFiles = await this.dirWalker.walk(repoPath, {}, fileCallback, errorCallback);
    
    logger.info(`ストリーミング処理完了: ${processedFiles} ファイルをスキャン、${projectCount} プロジェクトを処理`);
    return projectCount;
  }
}

export default ProjectDetector;
