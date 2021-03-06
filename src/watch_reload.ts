/**
 * watch_reload :	用于热更新nodejs模块内容，一般来说模块分为两种逻辑类型（带状态 或 无状态），
 * 					对于无状态的模块可以直接调用watch_reload方法自动挂载监控并在修改后自动变更
 * 					模块内容。
 * 					对于有状态的模块应该由用户手动完成逻辑的更新，此时就需要
 */
import * as events from "events";
import * as fs from 'fs';

type CallBackFunType = (...args:any[])=>void;

// 模块自动重新加载数据存储
interface IReloadNodeData {
	_modulePath: string;			//模块路径(原相对路径)，可用于移除时判定
	_modulePath_Resolved: string;	//模块修复后的绝对路径
	_require: NodeRequire;			//模块的require对象（用于做module的resolve及reload时替代require用
	_exports: any;					//导出至模块，重新加载后会覆盖该模块的内容
	_exportsSubModule?: string;		//导出的子模块名称（可选参数），如果不填或填入exports，则默认导入到_exports中，否则导入至_exports[_exportsSubModule]中
	_callback?:CallBackFunType;			//回调函数，在reload完成后，可以处理一些逻辑
}

// 导出模块默认执行函数
function watch_reload(_modulePath: string, _require: NodeRequire, _exports: any, _exportsSubModule?: string, _callback?:CallBackFunType):void {
	watch_reload.watch_reload(_modulePath, _require, _exports, _exportsSubModule, _callback);
}

namespace watch_reload {
	// 添加监听事件，当指定执行文件发生变更时候先自动reload require.cache中的内容，后调用注册的_callback函数，处理自定义的操作
	export function on(_modulePath: string, _require: NodeRequire, _callback:CallBackFunType) {
		const _modulePath_Resolved = _require.resolve(_modulePath);
		g_reload_event_center.on(_modulePath_Resolved, _callback);
		regist_file_listener(_modulePath_Resolved);
	}

	// 移除一个监听
	export function off(_modulePath: string, _require: NodeRequire, _callback:CallBackFunType) {
		g_reload_event_center.removeListener(_require.resolve(_modulePath), _callback);
	}

	// 监听文件修改事件，当文件变更重新加载指定模块
	export function watch_reload(_modulePath: string, _require: NodeRequire, _exports: any, _exportsSubModule?: string, _callback?:CallBackFunType) {
		const _modulePath_Resolved = _require.resolve(_modulePath);
		if (g_event_map.has(_modulePath_Resolved)) {
			const lst = g_event_map.get(_modulePath_Resolved);
			// 去除重复接口
			for (let data of lst) {
				if (data._modulePath_Resolved == _modulePath_Resolved && data._exports == _exports && data._exportsSubModule == _exportsSubModule)
					return;
			}
			lst.push({_modulePath, _modulePath_Resolved, _require, _exports, _exportsSubModule, _callback});
		} else {
			regist_file_listener(_modulePath_Resolved);
			g_event_map.set(_modulePath_Resolved, [{_modulePath, _modulePath_Resolved, _require, _exports, _exportsSubModule, _callback}]);
		}
	}

	// 手动重新加载指定模块
	export function reload_module(_modulePath: string, _require: NodeRequire, _exports: any, _exportsSubModule?: string, _callback?:CallBackFunType) {
		const _modulePath_Resolved = _require.resolve(_modulePath);
		if (require.cache[_modulePath_Resolved]) {
			delete require.cache[_modulePath_Resolved];
		}
		console.log('RELOAD MODULES <<<' + _modulePath + '>>>');
		__loadModule(_require(_modulePath), _exports, _exportsSubModule);
	}

	// 内部用函数，用于检查某个文件是否被监控，如果未被监控，添加监控函数
	function regist_file_listener(_modulePath_Resolved: string): void {
		if (g_file_listener_lst.has(_modulePath_Resolved)) {
			return;
		}
		fs.watchFile(_modulePath_Resolved, (curr: fs.Stats, prev: fs.Stats)=>{
				//清理缓存
				if (require.cache[_modulePath_Resolved]) {
					delete require.cache[_modulePath_Resolved];
				}

				//循环遍历重新加载模块
				const reloadLst = g_event_map.get(_modulePath_Resolved);
				if (reloadLst) {
					for (const rl of reloadLst) {
						console.log('Reload Export <<<' + rl._modulePath + '>>>');
						__loadModule(rl._require(rl._modulePath), rl._exports, rl._exportsSubModule);
						if (rl._callback) {
							rl._callback();
						}
					}
				} else {
					// 重新加载一次
					require(_modulePath_Resolved);
				}

				g_reload_event_center.emit(_modulePath_Resolved);
			});
		g_file_listener_lst.add(_modulePath_Resolved);
	}

	const g_reload_event_center = new events.EventEmitter(); // 记录监听重新加载事件
	const g_event_map = new Map<string, Array<IReloadNodeData> >(); // 记录重新加载的列表
	const g_file_listener_lst = new Set<string>(); // 记录是否挂载文件监听
}

// 将指定模块重新导出模块内容至指定变量中
function __loadModule(m, _exports, _moduleName) {
	if (!_exports) return;
	for (var p in m) {
		if (_moduleName && _moduleName != "exports")		_exports[_moduleName][p] = m[p];
		else												_exports[p] = m[p];
	}
}

export = watch_reload;
