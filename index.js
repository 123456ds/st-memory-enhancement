import {
    eventSource,
    event_types,
    saveChat,
    saveSettingsDebounced,
} from '../../../../script.js';
import { extension_settings, getContext, renderExtensionTemplateAsync } from '../../../extensions.js';
import { POPUP_TYPE, Popup, callGenericPopup } from '../../../popup.js';
import JSON5 from './index.min.mjs'
const VERSION = '1.1.3'

let waitingTable = null
let waitingTableIndex = null
let tablePopup = null
let copyTableData = null
let selectedCell = null
let tableEditActions = []
const userTableEditInfo = {
    chatIndex: null,
    editAble: false,
    tables: null,
    tableIndex: null,
    rowIndex: null,
    colIndex: null,
}
const editErrorInfo = {
    forgotCommentTag: false,
    functionNameError: false,
}

/**
 * 默认插件设置
 */
const defaultSettings = {
    injection_mode: 'deep_system',
    deep: -2,
    message_template: `# dataTable表格
dataTable是一个用于储存故事数据的csv格式表格，可以作为你推演下文的重要参考。推演的下文可以在表格基础上做出发展，并影响表格。
## A. 表格说明及数据
你可以在这里查看所有的表格数据，以及表格的说明和修改表格的触发条件。表格中表名格式为[tableIndex:表名]例如[2:角色特征表格];列名的格式为[colIndex:列名]例如[2:示例列];行名的格式为[rowIndex]。
{{tableData}}
# 增删改dataTable操作方法
当你生成正文后，根据前面所列的增删改触发条件，如果判断数据dataTable中的内容需要增删改，则使用这里的操作方法进行。
注意：
1. 当用户要求修改表格时，用户要求的优先级最高。
2. 使用insertRow函数插入行时，应上帝视角填写所有列，禁止写成未知或者空值。
3. 单元格中，不要出现逗号，语义分割应使用/代替。

## 1. 在某个表格中插入新行，使用insertRow函数：
insertRow(tableIndex:number, data:{[colIndex:number]:string|number})
例如：insertRow(0, {0: '2021-10-01', 1: '12:00', 2: '教室', 3: '悠悠'})
注意：请检查data:{[colIndex:number]:string|number}参数是否包含所有的colIndex，且禁止填写为未知。
## 2. 在某个表格中删除行，使用deleteRow函数：
deleteRow(tableIndex:number, rowIndex:number)
例如：deleteRow(0, 0)
## 3. 在某个表格中更新行，使用updateRow函数：
updateRow(tableIndex:number, rowIndex:number, data:{[colIndex:number]:string|number})
例如：updateRow(0, 0, {3: '惠惠'})

你需要根据【增删改触发条件】对每个表格是否需要增删改进行检视，如果有需要增删改的表格，需要你在<tableEdit>标签中使用js的函数写法调用函数。
注意：标签内需要使用<!-- -->标记进行注释

输出示例：
<tableEdit>
<!--
updateRow(0, 0, {3: '惠惠/悠悠'})
insertRow(1, {1:'悠悠', 1:'身高170/体重60kg/身材娇小/黑色长发', 2:'开朗活泼', 3:'学生', 4:'打羽毛球, 5:'鬼灭之刃', 6:'宿舍', 7:'是运动部部长'})
insertRow(2, {1:'悠悠', 1:'喜欢', 2:'依赖/喜欢', 3:'高'})
insertRow(4, {0: '惠惠/悠悠', 1: '惠惠向悠悠表白', 2: '2021-10-01', 3: '教室',4:'感动'})
-->
</tableEdit>
`,
    tableStructure: [
        {
            tableName: "时空表格", tableIndex: 0, columns: ['日期', '时间', '地点（当前描写）', '此地角色'], columnsIndex: [0, 1, 2, 3], enable: true, Required: true, note: "记录时空信息的表格，应保持在一行",
            initNode: '本轮需要记录当前时间、地点、人物信息，使用insertRow函数', updateNode: "当描写的场景，时间，人物变更时", deleteNode: "此表大于一行时应删除多余行"
        },
        {
            tableName: '角色特征表格', tableIndex: 1, columns: ['角色名', '身体特征', '性格', '职业', '爱好', '喜欢的事物（作品、虚拟人物、物品等）', '住所', '其他重要信息'], enable: true, Required: true, columnsIndex: [0, 1, 2, 3, 4, 5, 6, 7], note: '角色天生或不易改变的特征csv表格，思考本轮有否有其中的角色，他应作出什么反应',
            initNode: '本轮必须从上文寻找已知的所有角色使用insertRow插入，角色名不能为空', insertNode: '当本轮出现表中没有的新角色时，应插入', updateNode: "当角色的身体出现持久性变化时，例如伤痕/当角色有新的爱好，职业，喜欢的事物时/当角色更换住所时/当角色提到重要信息时", deleteNode: ""
        },
        {
            tableName: '角色与<user>社交表格', tableIndex: 2, columns: ['角色名', '对<user>关系', '对<user>态度', '对<user>好感'], columnsIndex: [0, 1, 2, 3], enable: true, Required: true, note: '思考如果有角色和<user>互动，应什么态度',
            initNode: '本轮必须从上文寻找已知的所有角色使用insertRow插入，角色名不能为空', insertNode: '当本轮出现表中没有的新角色时，应插入', updateNode: "当角色和<user>的交互不再符合原有的记录时/当角色和<user>的关系改变时", deleteNode: ""
        },
        {
            tableName: '任务、命令或者约定表格', tableIndex: 3, columns: ['角色', '任务', '地点', '持续时间'], columnsIndex: [0, 1, 2, 3], enable: true, Required: false, note: '思考本轮是否应该执行任务/赴约',
            insertNode: '当特定时间约定一起去做某事时/某角色收到做某事的命令或任务时', updateNode: "", deleteNode: "当大家赴约时/任务或命令完成时/任务，命令或约定被取消时"
        },
        {
            tableName: '重要事件历史表格', tableIndex: 4, columns: ['角色', '事件简述', '日期', '地点', '情绪'], columnsIndex: [0, 1, 2, 3, 4], enable: true, Required: true, note: '记录<user>或角色经历的重要事件',
            initNode: '本轮必须从上文寻找可以插入的事件并使用insertRow插入', insertNode: '当某个角色经历让自己印象深刻的事件时，比如表白、分手等', updateNode: "", deleteNode: ""
        },
        {
            tableName: '重要物品表格', tableIndex: 5, columns: ['拥有人', '物品描述', '物品名', '重要原因'], columnsIndex: [0, 1, 2, 3], enable: true, Required: false, note: '对某人很贵重或有特殊纪念意义的物品',
            insertNode: '当某人获得了贵重或有特殊意义的物品时/当某个已有物品有了特殊意义时', updateNode: "", deleteNode: ""
        },
    ],
    isExtensionAble: true,
};

/**
 * 通过表格索引查找表格结构
 * @param {number} index 表格索引
 * @returns 此索引的表格结构
 */
function findTableStructureByIndex(index) {
    return extension_settings.muyoo_dataTable.tableStructure.find(table => table.tableIndex === index);
}

/**
 * 加载设置
 */
function loadSettings() {
    extension_settings.muyoo_dataTable = extension_settings.muyoo_dataTable || {};
    for (const key in defaultSettings) {
        if (!Object.hasOwn(extension_settings.muyoo_dataTable, key)) {
            extension_settings.muyoo_dataTable[key] = defaultSettings[key];
        }
    }
    extension_settings.muyoo_dataTable.message_template = defaultSettings.message_template
    extension_settings.muyoo_dataTable.tableStructure = defaultSettings.tableStructure
    if (!extension_settings.muyoo_dataTable.updateIndex) {
        if (extension_settings.muyoo_dataTable.deep === -3) extension_settings.muyoo_dataTable.deep = -2
        extension_settings.muyoo_dataTable.updateIndex = 1
    }
    $(`#dataTable_injection_mode option[value="${extension_settings.muyoo_dataTable.injection_mode}"]`).attr('selected', true);
    $('#dataTable_deep').val(extension_settings.muyoo_dataTable.deep);
    $('#dataTable_message_template').val(extension_settings.muyoo_dataTable.message_template);
    updateSwitch()
}

/**
 * 更新设置中的开关状态
 */
function updateSwitch() {
    if (extension_settings.muyoo_dataTable.isExtensionAble) {
        $("#table_switch .table-toggle-on").show()
        $("#table_switch .table-toggle-off").hide()
    } else {
        $("#table_switch .table-toggle-on").hide()
        $("#table_switch .table-toggle-off").show()
    }
}

/**
 * 重置设置
 */
function resetSettings() {
    extension_settings.muyoo_dataTable = { ...defaultSettings };
    loadSettings();
    saveSettingsDebounced();
    toastr.success('已重置设置');
}

/**
 * 初始化所有表格
 * @returns 所有表格对象数组
 */
function initAllTable() {
    return extension_settings.muyoo_dataTable.tableStructure.map(data => new Table(data.tableName, data.tableIndex, data.columns))
}

/**
 * 检查数据是否为Table实例，不是则重新创建
 * @param {Table[]} dataTable 所有表格对象数组
 */
function checkPrototype(dataTable) {
    for (let i = 0; i < dataTable.length; i++) {
        if (!(dataTable[i] instanceof Table)) {
            const table = dataTable[i]
            dataTable[i] = new Table(table.tableName, table.tableIndex, table.columns, table.content, table.insertedRows, table.updatedRows)
        }
    }
}

/**
 * 寻找最新的表格数据，若没有，就新建一个
 * @param isIncludeEndIndex 搜索时是否包含endIndex
 * @param endIndex 结束索引，自此索引向上寻找，默认是最新的消息索引
 * @returns 自结束索引向上寻找，最近的表格数据
 */
function findLastestTableData(isIncludeEndIndex = false, endIndex = -1) {
    let chat = getContext().chat
    if (endIndex === -1) chat = isIncludeEndIndex ? chat : chat.slice(0, -1)
    else chat = chat.slice(0, isIncludeEndIndex ? endIndex + 1 : endIndex)
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i].is_user === false && chat[i].dataTable) {
            checkPrototype(chat[i].dataTable)
            return { tables: chat[i].dataTable, index: i }
        }
    }
    const newTableList = initAllTable()
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i].is_user === false) {
            return { tables: newTableList, index: i }
        }
    }
    return { tables: newTableList, index: -1 }
}

/**
 * 寻找下一个含有表格数据的消息，如寻找不到，则返回null
 * @param startIndex 开始寻找的索引
 * @param isIncludeStartIndex 是否包含开始索引
 * @returns 寻找到的mes数据
 */
function findNextChatWhitTableData(startIndex, isIncludeStartIndex = false) {
    if (startIndex === -1) return { index: - 1, chat: null }
    const chat = getContext().chat
    for (let i = isIncludeStartIndex ? startIndex : startIndex + 1; i < chat.length; i++) {
        if (chat[i].is_user === false && chat[i].dataTable) {
            checkPrototype(chat[i].dataTable)
            return { index: i, chat: chat[i] }
        }
    }
    return { index: - 1, chat: null }
}

/**
 * 搜寻最后一个含有表格数据的消息，并生成提示词
 * @returns 生成的完整提示词
 */
export function initTableData() {
    const { tables } = findLastestTableData(true)
    const promptContent = getAllPrompt(tables)
    console.log("完整提示", promptContent)
    return promptContent
}

/**
 * 获取所有的完整提示词
 * @param {Table[]} tables 所有表格对象数组
 * @returns 完整提示词
 */
function getAllPrompt(tables) {
    const tableDataPrompt = tables.map(table => table.getTableText()).join('\n')
    return extension_settings.muyoo_dataTable.message_template.replace('{{tableData}}', tableDataPrompt)
}

/**
 * 深拷贝所有表格数据
 * @param {Table[]} tableList 要拷贝的表格对象数组
 * @returns 拷贝后的表格对象数组
 */
function copyTableList(tableList) {
    return tableList.map(table => new Table(table.tableName, table.tableIndex, table.columns, JSON.parse(JSON.stringify(table.content))))
}

/**
 * 将单元格中的逗号替换为/符号
 * @param {string | number} cell 
 * @returns 处理后的单元格值
 */
function handleCellValue(cell) {
    if (typeof cell === 'string') {
        return cell.replace(/,/g, "/")
    } else if (typeof cell === 'number') {
        return cell
    }
    return ''
}

/**
 * 获取表格为空时的提示词
 * @param {boolean} Required 此表格是否为必填表格
 * @param {string} node 此表格的初始化提示词
 * @returns 
 */
function getEmptyTablePrompt(Required, node) {
    return '（此表格为空' + (Required ? (node ? ('，' + node) : '') : '') + '）\n'
}

/**
 * 获取表格编辑规则提示词
 * @param {Structure} structure 表格结构信息
 * @param {boolean} isEmpty 表格是否为空
 * @returns 
 */
function getTableEditRules(structure, isEmpty) {
    if (structure.Required && isEmpty) return '【增删改触发条件】\n插入：' + replaceUserTag(structure.initNode) + '\n'
    else {
        let editRules = '【增删改触发条件】\n'
        if (structure.insertNode) editRules += ('插入：' + replaceUserTag(structure.insertNode) + '\n')
        if (structure.updateNode) editRules += ('更新：' + replaceUserTag(structure.updateNode) + '\n')
        if (structure.deleteNode) editRules += ('删除：' + replaceUserTag(structure.deleteNode) + '\n')
        return editRules
    }
}

/**
 * 处理表格中的单元格点击事件
 * @param {Event} event 点击事件
 */
function onTdClick(event) {
    if (selectedCell) {
        selectedCell.removeClass("selected");
    }
    selectedCell = $(this);
    selectedCell.addClass("selected");
    saveTdData(selectedCell.data("tableData"))
    // 计算工具栏位置
    const cellOffset = selectedCell.offset();
    const containerOffset = $("#tableContainer").offset();
    const relativeY = cellOffset.left - containerOffset.left;
    const relativeX = cellOffset.top - containerOffset.top;
    const clickedElement = event.target;
    hideAllEditPanels()
    if (clickedElement.tagName.toLowerCase() === "td") {
        $("#tableToolbar").css({
            top: relativeX + 32 + "px",
            left: relativeY + "px"
        }).show();
    } else if (clickedElement.tagName.toLowerCase() === "th") {
        $("#tableHeaderToolbar").css({
            top: relativeX + 32 + "px",
            left: relativeY + "px"
        }).show();
    }
    event.stopPropagation(); // 阻止事件冒泡
}

/**
 * 隐藏所有的编辑浮窗
 */
function hideAllEditPanels() {
    $("#tableToolbar").hide();
    $("#tableHeaderToolbar").hide();
}

/**
 * 将保存的data数据字符串保存到设置中
 * @param {string} data 保存的data属性字符串
 */
function saveTdData(data) {
    const [tableIndex, rowIndex, colIndex] = data.split("-");
    userTableEditInfo.tableIndex = parseInt(tableIndex);
    userTableEditInfo.rowIndex = parseInt(rowIndex);
    userTableEditInfo.colIndex = parseInt(colIndex);
}

/**
 * 表格类
 */
class Table {
    constructor(tableName, tableIndex, columns, content = [], insertedRows = [], updatedRows = []) {
        this.tableName = tableName
        this.tableIndex = tableIndex
        this.columns = columns
        this.content = content
        this.insertedRows = insertedRows
        this.updatedRows = updatedRows
    }

    /**
     * 清空插入或更新记录
     */
    clearInsertAndUpdate() {
        this.insertedRows = []
        this.updatedRows = []
    }

    /**
     * 获取表格内容的提示词
     * @returns 表格内容提示词
     */
    getTableText() {
        const structure = findTableStructureByIndex(this.tableIndex)
        if (!structure) return
        const title = `* ${this.tableIndex}:${replaceUserTag(this.tableName)}\n`
        const node = structure.note && structure.note !== '' ? '【说明】' + structure.note + '\n' : ''
        const headers = "rowIndex," + this.columns.map((colName, index) => index + ':' + replaceUserTag(colName)).join(',') + '\n'
        const rows = this.content.length > 0 ? (this.content.map((row, index) => index + ',' + row.join(',')).join('\n') + '\n') : getEmptyTablePrompt(structure.Required, replaceUserTag(structure.initNode))
        return title + node + '【表格内容】\n' + headers + rows + getTableEditRules(structure, this.content.length == 0) + '\n'
    }

    /**
     * 插入一行数据
     * @param {object} data 
     */
    insert(data) {
        const newRow = new Array(this.columns.length).fill("");
        Object.entries(data).forEach(([key, value]) => { newRow[key] = handleCellValue(value) })
        const newRowIndex = this.content.push(newRow) - 1
        this.insertedRows.push(newRowIndex)
        return newRowIndex
    }

    /**
     * 插入一个空行
     * @param {number} rowIndex 插入空行的索引
     */
    insertEmptyRow(rowIndex) {
        this.content.splice(rowIndex, 0, this.getEmptyRow())
    }

    /**
     * 获取一个空行
     * @returns 一个空行
     */
    getEmptyRow() {
        return this.columns.map(() => '')
    }

    /**
     * 更新单个行的内容
     * @param {number} rowIndex 需要更新的行索引
     * @param {object} data 需要更新的数据
     */
    update(rowIndex, data) {
        const row = this.content[rowIndex]
        if (!row) return this.insert(data)
        Object.entries(data).forEach(([key, value]) => {
            row[key] = handleCellValue(value)
            this.updatedRows.push(`${rowIndex}-${key}`)
        })
    }

    /**
     * 删除单个行
     * @param {number} rowIndex 删除单个行的索引
     */
    delete(rowIndex) {
        this.content[rowIndex] = null
    }

    /**
     * 清除空行
     */
    clearEmpty() {
        this.content = this.content.filter(Boolean)
    }

    /**
     * 获取某个单元格的值
     * @param {number} rowIndex 行索引
     * @param {number} colIndex 列索引
     * @returns 此单元格的值
     */
    getCellValue(rowIndex, colIndex) {
        return this.content[rowIndex][colIndex]
    }

    /**
     * 设置某个单元格的值
     * @param {number} rowIndex 行索引
     * @param {number} colIndex 列索引
     * @param {any} value 需要设置的值
     */
    setCellValue(rowIndex, colIndex, value) {
        this.content[rowIndex][colIndex] = handleCellValue(value)
    }

    /**
     * 干运行
     * @param {TableEditAction[]} actions 需要执行的编辑操作
     */
    dryRun(actions) {
        this.clearInsertAndUpdate()
        let nowRowIndex = this.content.length
        for (const action of actions) {
            if (action.tableIndex !== this.tableIndex) continue
            if (action.type === 'Insert') {
                action.rowIndex = nowRowIndex
                this.insertedRows.push(nowRowIndex)
                nowRowIndex++
            } else if (action.type === 'Update') {
                const updateData = action.data
                for (const colIndex in updateData) {
                    this.updatedRows.push(`${action.rowIndex}-${colIndex}`)
                }
            }
        }
    }

    /**
     * 把表格数据渲染成DOM元素
     * @returns DOM容器元素
     */
    render() {
        const container = document.createElement('div')
        container.classList.add('justifyLeft')
        container.classList.add('scrollable')
        const title = document.createElement('h3')
        title.innerText = replaceUserTag(this.tableName)
        const table = document.createElement('table')
        if (userTableEditInfo.editAble) {
            $(table).on('click', 'td', onTdClick)
            $(table).on('click', 'th', onTdClick)
        }
        table.classList.add('tableDom')
        const thead = document.createElement('thead')
        const titleTr = document.createElement('tr')
        this.columns.forEach(colName => {
            const th = document.createElement('th')
            $(th).data("tableData", this.tableIndex + '-0-0')
            th.innerText = replaceUserTag(colName)
            titleTr.appendChild(th)
        })
        thead.appendChild(titleTr)
        table.appendChild(thead)
        const tbody = document.createElement('tbody')
        for (let rowIndex in this.content) {
            const tr = document.createElement('tr')
            for (let cellIndex in this.content[rowIndex]) {
                const td = document.createElement('td')
                $(td).data("tableData", this.tableIndex + '-' + rowIndex + '-' + cellIndex)
                td.innerText = this.content[rowIndex][cellIndex]
                if (this.updatedRows && this.updatedRows.includes(rowIndex + '-' + cellIndex)) $(td).css('background-color', 'rgba(0, 98, 128, 0.2)')
                tr.appendChild(td)
            }
            if (this.insertedRows && this.insertedRows.includes(parseInt(rowIndex))) {
                $(tr).css('background-color', 'rgba(0, 128, 0, 0.2)')
            }
            tbody.appendChild(tr)
        }
        table.appendChild(tbody)
        container.appendChild(title)
        container.appendChild(table)
        return container
    }
}

async function onChatChanged() {
}

/**
 * 替换字符串中的user标签
 */
function replaceUserTag(str) {
    if (str == null) return
    return str.replace(/<user>/g, getContext().name1)
}

/**
 * 在表格末尾插入行
 * @param {number} tableIndex 表格索引
 * @param {object} data 插入的数据
 * @returns 新插入行的索引
 */
function insertRow(tableIndex, data) {
    if (tableIndex == null) return toastr.error('insert函数，tableIndex函数为空');
    if (data == null) return toastr.error('insert函数，data函数为空');
    const table = waitingTable[tableIndex]
    return table.insert(data)
}

/**
 * 删除行
 * @param {number} tableIndex 表格索引
 * @param {number} rowIndex 行索引
 */
function deleteRow(tableIndex, rowIndex) {
    if (tableIndex == null) return toastr.error('delete函数，tableIndex函数为空');
    if (rowIndex == null) return toastr.error('delete函数，rowIndex函数为空');
    const table = waitingTable[tableIndex]
    table.delete(rowIndex)
}

/**
 * 更新单个行的信息
 * @param {number} tableIndex 表格索引
 * @param {number} rowIndex 行索引
 * @param {object} data 更新的数据
 */
function updateRow(tableIndex, rowIndex, data) {
    if (tableIndex == null) return toastr.error('update函数，tableIndex函数为空');
    if (rowIndex == null) return toastr.error('update函数，rowIndex函数为空');
    if (data == null) return toastr.error('update函数，data函数为空');
    const table = waitingTable[tableIndex]
    table.update(rowIndex, data)
}

/**
 * 清除表格中的所有空行
 */
function clearEmpty() {
    waitingTable.forEach(table => {
        table.clearEmpty()
    })
}

/**
 * 命令执行对象
 */
class TableEditAction {
    constructor(str) {
        this.able = true
        if (!str) return
        this.str = str.trim()
        this.parsingFunctionStr()
    }

    setActionInfo(type, tableIndex, rowIndex, data) {
        this.type = type
        this.tableIndex = tableIndex
        this.rowIndex = rowIndex
        this.data = data
    }

    parsingFunctionStr() {
        const { type, newFunctionStr } = isTableEditFunction(this.str)
        this.type = type
        if (this.type === 'Comment') {
            if (!this.str.startsWith('//')) this.str = '// ' + this.str
        }
        this.params = ParseFunctionParams(newFunctionStr)
        this.AssignParams()
    }

    AssignParams() {
        for (const paramIndex in this.params) {
            if (typeof this.params[paramIndex] === 'number')
                switch (paramIndex) {
                    case '0':
                        this.tableIndex = this.params[paramIndex]
                        break
                    case '1':
                        this.rowIndex = this.params[paramIndex]
                        break
                    default:
                        break
                }
            else if (typeof this.params[paramIndex] === 'string') {
                // 暂时处理第二位参数为undefined的情况
                if (paramIndex == '1') this.rowIndex = 0
            }
            else if (typeof this.params[paramIndex] === 'object' && this.params[paramIndex] !== null) {
                this.data = this.params[paramIndex]
            }
        }
    }

    execute() {
        try {
            switch (this.type) {
                case 'Update':
                    updateRow(this.tableIndex, this.rowIndex, this.data)
                    break
                case 'Insert':
                    const newRowIndex = insertRow(this.tableIndex, this.data)
                    this.rowIndex = newRowIndex
                    break
                case 'Delete':
                    deleteRow(this.tableIndex, this.rowIndex)
                    break
            }
        } catch (err) {
            toastr.error('表格操作函数执行错误，请重新生成本轮文本\n错误语句：' + this.str + '\n错误信息：' + err.message);
        }
    }

    format() {
        switch (this.type) {
            case 'Update':
                return `updateRow(${this.tableIndex}, ${this.rowIndex}, ${JSON.stringify(this.data).replace(/\\"/g, '"')})`
            case 'Insert':
                return `insertRow(${this.tableIndex}, ${JSON.stringify(this.data).replace(/\\"/g, '"')})`
            case 'Delete':
                return `deleteRow(${this.tableIndex}, ${this.rowIndex})`
            default:
                return this.str
        }
    }

}

/**
 * 将匹配到的整体字符串转化为单个语句的数组
 * @param {string[]} matches 匹配到的整体字符串
 * @returns 单条执行语句数组
 */
function handleTableEditTag(matches) {
    let functionList = [];
    matches.forEach(matchBlock => {
        const lines = trimString(matchBlock)
            .split('\n')
            .filter(line => line.length > 0);
        let currentFunction = '';
        let parenthesisCount = 0;
        for (const line of lines) {
            const trimmedLine = line.trim()
            if (trimmedLine.startsWith('//')) {
                functionList.push(trimmedLine)
                continue
            };
            currentFunction += trimmedLine;
            parenthesisCount += (trimmedLine.match(/\(/g) || []).length;
            parenthesisCount -= (trimmedLine.match(/\)/g) || []).length;
            if (parenthesisCount === 0 && currentFunction) {
                const formatted = currentFunction
                    .replace(/\s*\(\s*/g, '(')   // 移除参数括号内空格
                    .replace(/\s*\)\s*/g, ')')   // 移除结尾括号空格
                    .replace(/\s*,\s*/g, ',');   // 统一逗号格式
                functionList.push(formatted);
                currentFunction = '';
            }
        }
    });
    return functionList;
}
/**
 * 检查表格编辑字符串是否改变
 * @param {Chat} chat 单个聊天对象
 * @param {string[]} matches 新的匹配对象
 * @returns 
 */
function isTableEditStrChanged(chat, matches) {
    if (chat.tableEditMatches != null && chat.tableEditMatches.join('') === matches.join('')) {
        return false
    }
    chat.tableEditMatches = matches
    return true
}

/**
 * 修复将update和insert函数名写错的问题
 * @param {string} str 单个函数执行语句
 * @returns 修复后的函数执行语句
 */
function fixFunctionNameError(str) {
    if (str.startsWith("update("))
        return str.replace("update(", "updateRow(");
    if (str.startsWith("insert("))
        return str.replace("insert(", "insertRow(");
    if (str.startsWith("delete("))
        return str.replace("delete(", "deleteRow(");
    if (str.startsWith("updateRow(") || str.startsWith("insertRow(") || str.startsWith("deleteRow(")) return str
    return
}

/**
 * 检测单个语句是否是执行表格编辑的函数
 * @param {string} str 单个函数执行语句
 * @returns 是那种类型的表格编辑函数
 */
function isTableEditFunction(str) {
    let type = 'Comment'
    let newFunctionStr = ''
    if (str.startsWith("update(") || str.startsWith("updateRow(")) type = 'Update'
    if (str.startsWith("insert(") || str.startsWith("insertRow(")) type = 'Insert'
    if (str.startsWith("delete(") || str.startsWith("deleteRow(")) type = 'Delete'
    if (str.startsWith("update(") || str.startsWith("insert(") || str.startsWith("delete(")) editErrorInfo.functionNameError = true
    if (type !== 'Comment') newFunctionStr = str.replace(/^(insertRow|deleteRow|updateRow|update|insert|delete)\s*/, '').trim()
    return { type, newFunctionStr }
}

/**
 * 解析函数的参数字符串，并返回参数数组
 * @param {string} str 参数字符串
 * @returns 参数数组
 */
function ParseFunctionParams(str) {
    const paramStr = str.trim().replace(/^\(|\)$/g, '');
    const params = splitParams(paramStr)
    // 使用正则表达式匹配对象、字符串、数字
    const newParams = params.map(arg => {
        if (/^{.*}$/.test(arg)) {
            return handleJsonStr(arg); // 替换单引号为双引号后解析对象
        } else if (/^\d+$/.test(arg)) {
            return Number(arg); // 解析数字
        } else {
            return arg.replace(/^['"]|['"]$/g, ''); // 去除字符串的引号
        }
    });
    return newParams
}

/**
 * 分割函数的参数部分
 */
function splitParams(paramStr) {
    let params = [];
    let current = "";
    let inString = false;
    let inObject = 0; // 追踪 `{}` 作用域
    let quoteType = null;

    for (let i = 0; i < paramStr.length; i++) {
        let char = paramStr[i];
        // 处理字符串状态
        if ((char === '"' || char === "'") && paramStr[i - 1] !== '\\') {
            if (!inString) {
                inString = true;
                quoteType = char;
            } else if (char === quoteType) {
                inString = false;
            }
        }
        // 处理对象 `{}` 作用域
        if (char === '{' && !inString) inObject++;
        if (char === '}' && !inString) inObject--;
        // 遇到 `,` 只有在不在字符串和对象里的时候才分割
        if (char === ',' && !inString && inObject === 0) {
            params.push(current.trim());
            current = "";
        } else {
            current += char;
        }
    }
    if (current.trim()) params.push(current.trim()); // 最后一个参数
    return params;
}

/**
 * 处理json格式的字符串
 * @param {string} str json格式的字符串
 * @returns
 */
function handleJsonStr(str) {
    const jsonStr = str.replace(/([{,])\s*(\w+)\s*:/g, '$1"$2":')
    console.log("asasasa", str);

    return JSON5.parse(jsonStr);
}

/**
 * 处理文本内的表格编辑事件
 * @param {Chat} chat 单个聊天对象
 * @param {number} mesIndex 修改的消息索引
 * @param {boolean} ignoreCheck 是否跳过重复性检查
 * @returns 
 */
function handleEditStrInMessage(chat, mesIndex = -1, ignoreCheck = false) {
    if (!parseTableEditTag(chat, mesIndex, ignoreCheck)) return
    executeTableEditTag(chat, mesIndex)
}

/**
 * 解析回复中的表格编辑标签
 * @param {Chat} chat 单个聊天对象
 * @param {number} mesIndex 修改的消息索引
 * @param {boolean} ignoreCheck 是否跳过重复性检查
 */
function parseTableEditTag(chat, mesIndex = -1, ignoreCheck = false) {
    const { matches } = getTableEditTag(chat.mes)
    if (!ignoreCheck && !isTableEditStrChanged(chat, matches)) return false
    const functionList = handleTableEditTag(matches)
    // 寻找最近的表格数据
    const { tables, index: lastestIndex } = findLastestTableData(false, mesIndex)
    waitingTableIndex = lastestIndex
    waitingTable = copyTableList(tables)
    // 对最近的表格执行操作
    tableEditActions = functionList.map(functionStr => new TableEditAction(functionStr))
    dryRunExecuteTableEditTag()
    return true
}

/**
 * 执行回复中得编辑标签
 * @param {Chat} chat 单个聊天对象
 * @param {number} mesIndex 修改的消息索引
 */
function executeTableEditTag(chat, mesIndex = -1, ignoreCheck = false) {
    // 执行action
    waitingTable.forEach(table => table.clearInsertAndUpdate())
    tableEditActions.filter(action => action.able && action.type !== 'Comment').forEach(tableEditAction => tableEditAction.execute())
    clearEmpty()
    replaceTableEditTag(chat, getTableEditActionsStr())
    chat.dataTable = waitingTable
    // 如果不是最新的消息，则更新接下来的表格
    if (mesIndex !== -1) {
        const { index, chat: nextChat } = findNextChatWhitTableData(mesIndex)
        if (index !== -1) handleEditStrInMessage(nextChat, index, true)
    }
}

/**
 * 干运行获取插入action的插入位置和表格插入更新内容
 */
function dryRunExecuteTableEditTag() {
    waitingTable.forEach(table => table.dryRun(tableEditActions))
}

/**
 * 获取生成的操作函数字符串
 * @returns 生成的操作函数字符串
 */
function getTableEditActionsStr() {
    const tableEditActionsStr = tableEditActions.filter(action => action.able && action.type !== 'Comment').map(tableEditAction => tableEditAction.format()).join('\n')
    return "\n<!--\n" + (tableEditActionsStr === '' ? '' : (tableEditActionsStr + '\n')) + '-->\n'
}

/**
 * 替换聊天中的TableEdit标签内的内容
 * @param {*} chat 聊天对象
 */
function replaceTableEditTag(chat, newContent) {
    // 处理 mes
    if (/<tableEdit>.*?<\/tableEdit>/gs.test(chat.mes)) {
        chat.mes = chat.mes.replace(/<tableEdit>(.*?)<\/tableEdit>/gs, `<tableEdit>${newContent}</tableEdit>`);
    } else {
        chat.mes += `\n<tableEdit>${newContent}</tableEdit>`;
    }
    // 处理 swipes
    if (chat.swipes != null && chat.swipe_id != null)
        if (/<tableEdit>.*?<\/tableEdit>/gs.test(chat.swipes[chat.swipe_id])) {
            chat.swipes[chat.swipe_id] = chat.swipes[chat.swipe_id].replace(/<tableEdit>(.*?)<\/tableEdit>/gs, `<tableEdit>\n${newContent}\n</tableEdit>`);
        } else {
            chat.swipes[chat.swipe_id] += `\n<tableEdit>${newContent}</tableEdit>`;
        }
    getContext().saveChat();
}

/**
 * 获取在干运行中collection中排序的真实消息索引（未使用）
 * @param {*} identifier 
 * @param {*} collection 
 * @returns 
 */
function getRealIndexInCollectionInDryRun(identifier, collection) {
    const newCollection = collection.filter(Boolean).filter(item => item.collection && item.collection.length !== 0)
    let index = 0
    for (let i in newCollection) {
        if (newCollection[i].identifier === identifier) break
        const newMes = newCollection[i].collection.filter((mes) => mes.content !== '')
        index += newMes.length
    }
    return index
}

/**
 * 获取在collection中排序的真实消息索引（未使用）
 * @param {*} identifier 
 * @param {*} collection 
 * @returns 
 */
function getRealIndexInCollection(identifier, collection) {
    const excludeList = ['newMainChat', 'newChat', 'groupNudge'];
    const shouldSquash = (message) => {
        return !excludeList.includes(message.identifier) && message.role === 'system' && !message.name;
    };
    let index = 0
    let isSquash = false
    for (let i in collection) {
        if (collection[i].identifier === identifier) break
    }
    return index
}

/**
 * 读取设置中的注入角色
 * @returns 注入角色
 */
function getMesRole() {
    switch (extension_settings.muyoo_dataTable.injection_mode) {
        case 'deep_system':
            return 'system'
        case 'deep_user':
            return 'user'
        case 'deep_assistant':
            return 'assistant'
    }
}

/**
 * 注入表格总体提示词
 * @param {*} eventData 
 * @returns 
 */
async function onChatCompletionPromptReady(eventData) {
    if (eventData.dryRun === true || extension_settings.muyoo_dataTable.isExtensionAble === false) return
    const promptContent = initTableData()
    eventData.chat.splice(extension_settings.muyoo_dataTable.deep, 0, { role: getMesRole(), content: promptContent })
    /* console.log("dryRun", eventData.dryRun)
    console.log("chatCompletionPromptReady", promptManager)
    const prompts = promptManager.getPromptCollection();
    const systemPrompt = { role: 'system', content: promptContent, identifier: 'groupNudge' }
    const markerIndex = prompts.index("tableData");
    const newPrompt = promptManager.preparePrompt(systemPrompt);
    const message = await Message.fromPromptAsync(newPrompt);
    const messageCollection = new MessageCollection("tableData", message)
    if (promptManager.messages.collection[markerIndex] == null) promptManager.messages.collection[markerIndex] = messageCollection;
    if (false === eventData.dryRun) promptManager.render(false)
    const realIndex = getRealIndexInCollectionInDryRun('tableData', promptManager.messages.collection)
    eventData.chat.splice(realIndex, 0, { role: "system", content: promptContent }) */
}


/**
 * 去掉编辑指令两端的空格和注释标签
 * @param {string} str 输入的编辑指令字符串
 * @returns 
 */
function trimString(str) {
    const str1 = str.trim()
    if (!str1.startsWith("<!--") || !str1.endsWith("-->")) {
        editErrorInfo.forgotCommentTag = true
    }
    return str1
        .replace(/^\s*<!--|-->?\s*$/g, "")
        .trim()
}

/**
 * 获取表格的tableEdit标签内的内容
 * @param {string} mes 消息正文字符串
 * @returns {matches} 匹配到的内容数组
 */
function getTableEditTag(mes) {
    const regex = /<tableEdit>(.*?)<\/tableEdit>/gs;
    const matches = [];
    let match;
    while ((match = regex.exec(mes)) !== null) {
        matches.push(match[1]);
    }
    const updatedText = mes.replace(regex, "");
    return { matches }
}

/**
 * 消息编辑时触发
 * @param this_edit_mes_id 此消息的ID
 */
async function onMessageEdited(this_edit_mes_id) {
    if (chat.is_user === true || extension_settings.muyoo_dataTable.isExtensionAble === false) return
    const chat = getContext().chat[this_edit_mes_id]
    handleEditStrInMessage(chat, parseInt(this_edit_mes_id))
}

/**
 * 消息接收时触发
 * @param {number} chat_id 此消息的ID
 */
async function onMessageReceived(chat_id) {
    if (extension_settings.muyoo_dataTable.isExtensionAble === false) return
    const chat = getContext().chat[chat_id];
    handleEditStrInMessage(chat)
}

/**
 * 打开表格展示/编辑弹窗
 * @param {number} mesId 需要打开的消息ID，-1为最新一条
 */
async function openTablePopup(mesId = -1) {
    const manager = await renderExtensionTemplateAsync('third-party/st-memory-enhancement', 'manager');
    tablePopup = new Popup(manager, POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: true });
    // 是否可编辑
    userTableEditInfo.editAble = findNextChatWhitTableData(mesId).index === -1
    const tableContainer = tablePopup.dlg.querySelector('#tableContainer');
    $(tableContainer).on('click', hideAllEditPanels)
    const tableEditTips = tablePopup.dlg.querySelector('#tableEditTips');
    // 设置编辑提示
    setTableEditTips(tableEditTips)
    // 开始寻找表格
    const { tables, index } = findLastestTableData(true, mesId)
    userTableEditInfo.chatIndex = index
    userTableEditInfo.tables = tables
    // 获取action信息
    if (userTableEditInfo.editAble && index !== -1 && (!waitingTableIndex || waitingTableIndex !== index)) {
        parseTableEditTag(getContext().chat[index], -1, true)
    }

    // 渲染
    renderTablesDOM(userTableEditInfo.tables, tableContainer, userTableEditInfo.editAble)
    // 拷贝粘贴
    const copyTableButton = tablePopup.dlg.querySelector('#copy_table_button');
    const pasteTableButton = tablePopup.dlg.querySelector('#paste_table_button');
    const clearTableButton = tablePopup.dlg.querySelector('#clear_table_button');
    if (!userTableEditInfo.editAble) $(pasteTableButton).hide()
    else pasteTableButton.addEventListener('click', () => pasteTable(index, tableContainer))
    copyTableButton.addEventListener('click', () => copyTable(tables))
    clearTableButton.addEventListener('click', () => clearTable(index, tableContainer))
    await tablePopup.show()
}

/**
 * 设置表格编辑Tips
 * @param {Element} tableEditTips 表格编辑提示DOM
 */
function setTableEditTips(tableEditTips) {
    const tips = $(tableEditTips)
    tips.empty()
    if (extension_settings.muyoo_dataTable.isExtensionAble === false) {
        tips.append('目前插件已关闭，将不会要求AI更新表格。')
        tips.css("color", "rgb(211 39 39)")
    } else if (userTableEditInfo.editAble) {
        tips.append('你可以在此页面上编辑表格，只需要点击你想编辑的单元格即可。绿色单元格为本轮插入的单元格，蓝色单元格为本轮修改的单元格。')
        tips.css("color", "lightgreen")
    } else {
        tips.append('此表格为中间表格，为避免混乱，不可被编辑和粘贴。你可以打开最新消息的表格进行编辑')
        tips.css("color", "lightyellow")
    }
}

/**
 * 渲染所有表格DOM及编辑栏
 * @param {Array} tables 所有表格数据
 * @param {Element} tableContainer 表格DOM容器
 * @param {boolean} isEdit 是否可以编辑
 */
function renderTablesDOM(tables = [], tableContainer, isEdit = false) {
    $(tableContainer).empty()
    if (isEdit) {
        const tableToolbar = $(tableEditToolbarDom)
        const tableHeaderToolbar = $(tableHeaderEditToolbarDom)
        tableToolbar.on('click', '#deleteRow', onDeleteRow)
        tableToolbar.on('click', '#editCell', onModifyCell)
        tableToolbar.on('click', '#insertRow', onInsertRow)
        tableHeaderToolbar.on('click', '#insertRow', onInsertFirstRow)
        $(tableContainer).append(tableToolbar)
        $(tableContainer).append(tableHeaderToolbar)
    }
    for (let table of tables) {
        $(tableContainer).append(table.render())
    }
}

/**
 * 删除行事件
 */
async function onDeleteRow() {
    const table = userTableEditInfo.tables[userTableEditInfo.tableIndex]
    const button = { text: '直接修改', result: 3 }
    const result = await callGenericPopup("请选择删除方式<br/>注意：如果你本轮需要使用直接和伪装两种方式，请先做完所有伪装操作，再做直接操作，以避免表格混乱", POPUP_TYPE.CONFIRM, "", { okButton: "伪装为AI删除", cancelButton: "取消", customButtons: [button] })
    if (result) {
        // 伪装修改
        if (result !== 3) {
            if (!table.insertedRows || !table.updatedRows)
                return toastr.error("由于旧数据兼容性问题，请再聊一次后再使用此功能")
            findAndDeleteActionsForDelete()
            const chat = getContext().chat[userTableEditInfo.chatIndex]
            replaceTableEditTag(chat, getTableEditActionsStr())
            handleEditStrInMessage(getContext().chat[userTableEditInfo.chatIndex], -1)
            userTableEditInfo.tables = waitingTable
        } else {
            table.delete(userTableEditInfo.rowIndex)
        }
        const tableContainer = tablePopup.dlg.querySelector('#tableContainer');
        renderTablesDOM(userTableEditInfo.tables, tableContainer, true)
        getContext().saveChat()
        toastr.success('已删除')
    }
}

/**
 * 修改单元格事件
 */
async function onModifyCell() {
    const table = userTableEditInfo.tables[userTableEditInfo.tableIndex]
    const cellValue = table.getCellValue(userTableEditInfo.rowIndex, userTableEditInfo.colIndex)
    const button = { text: '直接修改', result: 3 }
    const tableEditPopup = new Popup("注意：如果你本轮需要使用直接和伪装两种方式，请先做完所有伪装操作，再做直接操作，以避免表格混乱", POPUP_TYPE.INPUT, cellValue, { okButton: "伪装为AI修改", cancelButton: "取消", customButtons: [button] });
    const newValue = await tableEditPopup.show()
    if (newValue) {
        const tableContainer = tablePopup.dlg.querySelector('#tableContainer');
        // 伪装修改
        if (tableEditPopup.result !== 3) {
            findAndEditOrAddActionsForUpdate(newValue)
            const chat = getContext().chat[userTableEditInfo.chatIndex]
            replaceTableEditTag(chat, getTableEditActionsStr())
            handleEditStrInMessage(getContext().chat[userTableEditInfo.chatIndex], -1)
            userTableEditInfo.tables = waitingTable
        } else {
            table.setCellValue(userTableEditInfo.rowIndex, userTableEditInfo.colIndex, newValue)
        }
        renderTablesDOM(userTableEditInfo.tables, tableContainer, true)
        getContext().saveChat()
        toastr.success('已修改')
    }
}

/**
 * 寻找actions中是否有与修改值相关的行动，有则修改
 */
function findAndEditOrAddActionsForUpdate(newValue) {
    let haveAction = false
    tableEditActions.forEach((action) => {
        if (action.type === 'Update' || action.type === 'Insert') {
            if (action.tableIndex === userTableEditInfo.tableIndex && action.rowIndex === userTableEditInfo.rowIndex) {
                action.data[userTableEditInfo.colIndex] = newValue
                haveAction = true
            }
        }
    })
    if (!haveAction) {
        const newAction = new TableEditAction()
        const data = {}
        data[userTableEditInfo.colIndex] = newValue
        newAction.setActionInfo("Update", userTableEditInfo.tableIndex, userTableEditInfo.rowIndex, data)
        tableEditActions.push(newAction)
    }
}

/**
 * 寻找actions中是否有与删除值相关的行动，有则删除
 */
function findAndDeleteActionsForDelete() {
    let haveAction = false
    tableEditActions.forEach(action => {
        if (action.tableIndex === userTableEditInfo.tableIndex && action.rowIndex === userTableEditInfo.rowIndex) {
            action.able = false
            haveAction = true
            if (action.type === 'Update') {
                const newAction = new TableEditAction()
                newAction.setActionInfo("Delete", userTableEditInfo.tableIndex, userTableEditInfo.rowIndex)
                tableEditActions.push(newAction)
            }
        }
    })
    tableEditActions = tableEditActions.filter(action => action.able)
    if (!haveAction) {
        const newAction = new TableEditAction()
        newAction.setActionInfo("Delete", userTableEditInfo.tableIndex, userTableEditInfo.rowIndex)
        tableEditActions.push(newAction)
    }
}

/**
 * 在actions中插入值
 */
function addActionForInsert() {
    const newAction = new TableEditAction()
    newAction.setActionInfo("Insert", userTableEditInfo.tableIndex, userTableEditInfo.rowIndex, {})
    tableEditActions.push(newAction)
}


/**
 * 下方插入行事件
 */
async function onInsertRow() {
    const table = userTableEditInfo.tables[userTableEditInfo.tableIndex]
    const button = { text: '直接插入', result: 3 }
    const result = await callGenericPopup("请选择插入方式，目前伪装插入只能插入在表格底部<br/>注意：如果你本轮需要使用直接和伪装两种方式，请先做完所有伪装操作，再做直接操作，以避免表格混乱", POPUP_TYPE.CONFIRM, "", { okButton: "伪装为AI插入", cancelButton: "取消", customButtons: [button] })
    const tableContainer = tablePopup.dlg.querySelector('#tableContainer');
    if (result) {
        // 伪装输出
        if (result !== 3) {
            addActionForInsert()
            const chat = getContext().chat[userTableEditInfo.chatIndex]
            replaceTableEditTag(chat, getTableEditActionsStr())
            handleEditStrInMessage(getContext().chat[userTableEditInfo.chatIndex], -1)
            userTableEditInfo.tables = waitingTable
        } else {
            table.insertEmptyRow(userTableEditInfo.rowIndex + 1)
        }
        renderTablesDOM(userTableEditInfo.tables, tableContainer, true)
        getContext().saveChat()
        toastr.success('已插入')
    }
}

/**
 * 首行插入事件
 */
async function onInsertFirstRow() {
    const table = userTableEditInfo.tables[userTableEditInfo.tableIndex]
    const button = { text: '直接插入', result: 3 }
    const result = await callGenericPopup("请选择插入方式，目前伪装插入只能插入在表格底部<br/>注意：如果你本轮需要使用直接和伪装两种方式，请先做完所有伪装操作，再做直接操作，以避免表格混乱", POPUP_TYPE.CONFIRM, "", { okButton: "伪装为AI插入", cancelButton: "取消", customButtons: [button] })
    const tableContainer = tablePopup.dlg.querySelector('#tableContainer');
    if (result) {
        // 伪装输出
        if (result !== 3) {
            addActionForInsert()
            const chat = getContext().chat[userTableEditInfo.chatIndex]
            replaceTableEditTag(chat, getTableEditActionsStr())
            handleEditStrInMessage(getContext().chat[userTableEditInfo.chatIndex], -1)
            userTableEditInfo.tables = waitingTable
        } else {
            table.insertEmptyRow(0)
        }
        renderTablesDOM(userTableEditInfo.tables, tableContainer, true)
        getContext().saveChat()
        toastr.success('已插入')
    }
}

/**
 * 滑动切换消息事件
 */
async function onMessageSwiped(chat_id) {
    if (extension_settings.muyoo_dataTable.isExtensionAble === false) return
    const chat = getContext().chat[chat_id];
    console.log("滑动", chat)
    handleEditStrInMessage(chat)
}

async function updateTablePlugin() {

}

/**
 * 复制表格
 * @param {*} tables 所有表格数据
 */
async function copyTable(tables = []) {
    const jsonTables = JSON.stringify(tables)
    copyTableData = jsonTables
    toastr.success('已复制')
}

/**
 * 粘贴表格
 * @param {number} mesId 需要粘贴到的消息id
 * @param {Element} tableContainer 表格容器DOM
 */
async function pasteTable(mesId, tableContainer) {
    if (mesId === -1) {
        toastr.error("请至少让ai回复一条消息作为表格载体")
        return
    }
    const confirmation = await callGenericPopup('粘贴会清空原有的表格数据，是否继续？', POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    if (confirmation) {
        if (copyTableData) {
            const tables = JSON.parse(copyTableData)
            checkPrototype(tables)
            getContext().chat[mesId].dataTable = tables
            renderTablesDOM(tables, tableContainer, true)
            toastr.success('粘贴成功')
        } else {
            toastr.error("粘贴失败：剪切板没有表格数据")
        }
    }
}

/**
 * 清空表格
 * @param {number} mesId 需要清空表格的消息id
 * @param {Element} tableContainer 表格容器DOM
 */
async function clearTable(mesId, tableContainer) {
    if (mesId === -1) return
    const confirmation = await callGenericPopup('清空此条的所有表格数据，是否继续？', POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    if (confirmation) {
        const emptyTable = initAllTable()
        getContext().chat[mesId].dataTable = emptyTable
        renderTablesDOM(emptyTable, tableContainer, true)
        toastr.success('清空成功')
    }
}

/**
 * 表格编辑浮窗
 */
const tableEditToolbarDom = `<div class="tableToolbar" id="tableToolbar">
    <button id="editCell" class="menu_button">编辑</button>
    <button id="deleteRow" class="menu_button">删除行</button>
    <button id="insertRow" class="menu_button">下方插入行</button>
</div>`

/**
 * 表头编辑浮窗
 */
const tableHeaderEditToolbarDom = `
<div class="tableToolbar" id="tableHeaderToolbar">
    <button id="insertRow" class="menu_button">下方插入行</button>
</div>
`

jQuery(async () => {
    fetch("http://api.muyoo.com.cn/check-version", {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientVersion: VERSION, user: getContext().name1 })
    }).then(res => res.json()).then(res => {
        if (res.success) {
            if (!res.isLatest) $("#tableUpdateTag").show()
            if (res.toastr) toastr.warning(res.toastrText)
            if (res.message) $("#table_message_tip").text(res.message)
        }
    })
    const html = await renderExtensionTemplateAsync('third-party/st-memory-enhancement', 'index');
    const buttonHtml = await renderExtensionTemplateAsync('third-party/st-memory-enhancement', 'buttons');
    const button = `
    <div title="查看表格" class="mes_button open_table_by_id">
        表格
    </div>`;
    $('#data_bank_wand_container').append(buttonHtml);
    $('.extraMesButtons').append(button);
    $('#translation_container').append(html);
    $(document).on('pointerup', '.open_table_by_id', function () {
        try {
            const messageId = $(this).closest('.mes').attr('mesid');
            openTablePopup(parseInt(messageId));
        } catch (err) {
            console.error('Failed to copy: ', err);
        }
    });
    loadSettings();
    $('#dataTable_injection_mode').on('change', (event) => {
        extension_settings.muyoo_dataTable.injection_mode = event.target.value;
        saveSettingsDebounced();
    });
    $('#dataTable_message_template').on("input", function () {
        const value = $(this).val();
        extension_settings.muyoo_dataTable.message_template = value;
        saveSettingsDebounced();
    })
    $('#dataTable_deep').on("input", function () {
        const value = $(this).val();
        extension_settings.muyoo_dataTable.deep = value;
        saveSettingsDebounced();
    })
    $("#open_table").on('click', () => openTablePopup());
    $("#reset_settings").on('click', () => resetSettings());
    $("#table_update_button").on('click', updateTablePlugin);
    $(".table-toggle-on").on('click', () => {
        extension_settings.muyoo_dataTable.isExtensionAble = false;
        updateSwitch()
        saveSettingsDebounced();
        toastr.success('插件已关闭，可以打开和编辑表格但不会要求AI生成');
    })
    $(".table-toggle-off").on('click', () => {
        extension_settings.muyoo_dataTable.isExtensionAble = true;
        updateSwitch()
        saveSettingsDebounced();
        toastr.success('插件已开启');
    })
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, onChatCompletionPromptReady);
    eventSource.on(event_types.MESSAGE_EDITED, onMessageEdited);
    eventSource.on(event_types.MESSAGE_SWIPED, onMessageSwiped);
});
