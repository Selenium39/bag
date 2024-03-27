const { Transform } = require('stream');
const { Console } = require('console');

// 按照table格式输出，默认的console.table有index列
function table(input) {
    const ts = new Transform({ transform(chunk, enc, cb) { cb(null, chunk) } })
    const logger = new Console({ stdout: ts })
    logger.table(input)
    const table = (ts.read() || '').toString()
    let result = '';
    for (let row of table.split(/[\r\n]+/)) {
      let r = row.replace(/[^┬]*┬/, '┌');
      r = r.replace(/^├─*┼/, '├');
      r = r.replace(/│[^│]*/, '');
      r = r.replace(/^└─*┴/, '└');
      r = r.replace(/'/g, ' ');
      result += `${r}\n`;
    }
    console.log(result);
  }

  // 控制并发请求
  async function parallelFetch(tasks, concurrency) {
    let index = 0;
    async function next() {
      if (index < tasks.length) {
        const taskIndex = index++;
        const task = tasks[taskIndex];
        await task();
        await next();
      }
    }
  
    const workers = Array.from({ length: concurrency }, next);
    await Promise.all(workers);
  }

  module.exports = {
    table,
    parallelFetch
  }