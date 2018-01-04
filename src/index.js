/**
 *
 例子：

 import { h, app } from "hyperapp"

 const state = {
  count: 0
}

 const actions = {
  down: () => state => ({ count: state.count - 1 }),
  up: () => state => ({ count: state.count + 1 })
}

 const view = (state, actions) => (
 <main>
 <h1>{state.count}</h1>
 <button onclick={actions.down}>-</button>
 <button onclick={actions.up}>+</button>
 </main>
 )

 export const main = app(state, actions, view, document.body)

 运行流程：

 1. 运行app函数 并返回action列表
 2. 运行vnode函数， 获取初始化的虚拟dom
 3. 运行init函数， init函数递归自调用
 4. 替换action的对应方法 (当触发action时， 触发repaint)

 当触发repaint的时候：
 如果有渲染锁 > 跳过
 否则在setTimeout中运行rend函数

 rend函数:
 1. 给渲染锁上锁
 2. 根据state和actions， 渲染出来的下一个试图
 3. 运行patch函数，更新试图
 */

/**
 * 返回虚拟dom节点
 * @param name
 * @param props
 * @returns {{name: string, props: *|{}, children: Array}}
 */
export function h(name, props) {
  var node; // 虚拟dom
  var stack = []; // 堆栈
  var children = []; // 子集虚拟dom

  // 如果参数大于2个，说明有子节点
  for (var i = arguments.length; i-- > 2; ) {
    stack.push(arguments[i]);
  }

  // 遍历堆栈
  while (stack.length) {
    // 如果子集节点为一个数组（多个子集节点）
    if (Array.isArray((node = stack.pop()))) {
      // 逐个push到stack中
      for (i = node.length; i--; ) {
        stack.push(node[i]);
      }
    } else if (null == node || true === node || false === node) {
      // 如果节点不存在，则忽略
    } else {
      // 如果是普通的节点
      children.push(typeof node === "number" ? node + "" : node);
    }
  }

  // 如果节点名为字符串，则返回虚拟dom
  // 如果为function， 则执行返回虚拟dom，这里并没有判断name是否为function
  return typeof name === "string"
    ? {
        name: name,
        props: props || {},
        children: children
      }
    : name(props || {}, children);
}

/**
 * 运行app
 * @param {Object} state  状态
 * @param {Object} actions  动作
 * @param {Function} view  相当于react的render函数， 返回虚拟dom
 * @param {HTMLElement} container 渲染的容器挂载点
 * @returns {*}
 */
export function app(state, actions, view, container) {
  var patchLock; // 渲染锁， 如果当前正在渲染，则把渲染任务放在下一个事件队列里面
  var lifecycle = []; // 生命周期
  var root = container && container.children[0]; // 挂载节点
  var node = vnode(root, [].map); // 虚拟dom

  // 初次运行程序， 开始渲染
  repaint(init([], (state = copy(state)), (actions = copy(actions))));

  return actions;

  /**
   * 递归调用创建虚拟dom
   * @param element dom节点，初次调用则为root节点
   * @param map
   * @returns {*|{name: string, props: {}, children: *}}
   */
  function vnode(element, map) {
    return (
      element && {
        name: element.nodeName.toLowerCase(),
        props: {},
        children: map.call(element.childNodes, function(element) {
          return 3 === element.nodeType
            ? element.nodeValue
            : vnode(element, map);
        })
      }
    );
  }

  /**
   * 渲染页面，会在重新运行时执行，或者再出发action的时候，状态发生变化
   * @param next
   */
  function render(next) {
    patchLock = !patchLock; // 更改当前的渲染状态
    next = view(state, actions); // 根据state和actions， 渲染出来的下一个试图

    // 如果当前没有正在选择， 跟更改对应的dom
    if (container && !patchLock) {
      // 运行patch算法
      root = patch(container, root, node, (node = next));
    }

    // 逐个运行生命周期
    while ((next = lifecycle.pop())) next();
  }

  /**
   * 重新渲染
   */
  function repaint() {
    if (!patchLock) {
      patchLock = !patchLock;
      setTimeout(render);
    }
  }

  /**
   * 对象浅拷贝
   * @param a
   * @param b
   * @returns {{}}
   */
  function copy(a, b) {
    var target = {};

    for (var i in a) target[i] = a[i];
    for (var i in b) target[i] = b[i];

    return target;
  }

  /**
   *
   * @param path
   * @param value
   * @param source
   * @param target
   * @returns {*}
   */
  function set(path, value, source, target) {
    if (path.length) {
      target[path[0]] =
        1 < path.length
          ? set(path.slice(1), value, source[path[0]], {})
          : value;
      return copy(source, target);
    }
    return value;
  }

  /**
   * 从source中获取深层路径的值
   * @param {string[]} path 属性路径
   * @param {Object} source 对象
   * @returns {*}
   */
  function get(path, source) {
    for (var i = 0; i < path.length; i++) {
      source = source[path[i]];
    }
    return source;
  }

  /**
   * 初始化函数
   * @param {string[]} path  初始化接受空的路径数组
   * @param slice state
   * @param actions action
   */
  function init(path, slice, actions) {
    // 遍历actions
    for (var key in actions) {
      // 如果action定义为function
      typeof actions[key] === "function"
        ? (function(key, action) {
            // 替换action的方法
            actions[key] = function(data) {
              slice = get(path, state); // 从state中，获取深层路径的值

              // 如果action执行后， 依旧是返回function
              if (typeof (data = action(data)) === "function") {
                // 那么再执行一次
                data = data(slice, actions);
              }

              // 如果执行action后返回的值，跟当前状态不一致
              // 则重新渲染页面，并且改变state
              if (data && data !== slice && !data.then) {
                repaint((state = set(path, copy(slice, data), state, {})));
              }

              // 返回状态值
              return data;
            };
          })(key, actions[key])
        : init(
            // 如果action不为function
            path.concat(key),
            (slice[key] = slice[key] || {}),
            (actions[key] = copy(actions[key]))
          );
    }
  }

  /**
   * 获取节点的key
   * @param node
   * @returns {null}
   */
  function getKey(node) {
    return node && node.props ? node.props.key : null;
  }

  /**
   * 设置元素的key值
   * @param element
   * @param name
   * @param value
   * @param oldValue
   */
  function setElementProp(element, name, value, oldValue) {
    if (name === "key") {
    } else if (name === "style") {
      for (var i in copy(oldValue, value)) {
        element[name][i] = null == value || null == value[i] ? "" : value[i];
      }
    } else {
      try {
        element[name] = null == value ? "" : value;
      } catch (_) {}

      if (typeof value !== "function") {
        if (null == value || false === value) {
          element.removeAttribute(name);
        } else {
          element.setAttribute(name, value);
        }
      }
    }
  }

  /**
   * 创建dom元素
   * @param node
   * @param isSVG
   * @returns {Text | any}
   */
  function createElement(node, isSVG) {
    if (typeof node === "string") {
      var element = document.createTextNode(node);
    } else {
      var element = (isSVG = isSVG || "svg" === node.name)
        ? document.createElementNS("http://www.w3.org/2000/svg", node.name)
        : document.createElement(node.name);

      if (node.props.oncreate) {
        lifecycle.push(function() {
          node.props.oncreate(element);
        });
      }

      for (var i = 0; i < node.children.length; i++) {
        element.appendChild(createElement(node.children[i], isSVG));
      }

      for (var name in node.props) {
        setElementProp(element, name, node.props[name]);
      }
    }
    return element;
  }

  /**
   * 更新dom元素
   * @param element
   * @param oldProps
   * @param props
   */
  function updateElement(element, oldProps, props) {
    for (var name in copy(oldProps, props)) {
      if (
        props[name] !==
        ("value" === name || "checked" === name
          ? element[name]
          : oldProps[name])
      ) {
        setElementProp(element, name, props[name], oldProps[name]);
      }
    }

    if (props.onupdate) {
      lifecycle.push(function() {
        props.onupdate(element, oldProps);
      });
    }
  }

  /**
   * 移除元素的子节点
   * @param element
   * @param node
   * @param props
   * @returns {*}
   */
  function removeChildren(element, node, props) {
    if ((props = node.props)) {
      for (var i = 0; i < node.children.length; i++) {
        removeChildren(element.childNodes[i], node.children[i]);
      }

      if (props.ondestroy) {
        props.ondestroy(element);
      }
    }
    return element;
  }

  /**
   * 移除元素
   * @param parent
   * @param element
   * @param node
   * @param cb
   */
  function removeElement(parent, element, node, cb) {
    function done() {
      parent.removeChild(removeChildren(element, node));
    }

    if (node.props && (cb = node.props.onremove)) {
      cb(element, done);
    } else {
      done();
    }
  }

  /**
   * 改变dom节点
   * @param parent
   * @param element
   * @param oldNode
   * @param node
   * @param isSVG
   * @param nextSibling
   * @returns {*}
   */
  function patch(parent, element, oldNode, node, isSVG, nextSibling) {
    // 如果新节点跟旧节点一样， 则跳过
    if (node === oldNode) {
    } else if (null == oldNode) {
      // 如果旧的节点不存在， 则在父节点前插入一个新节点
      element = parent.insertBefore(createElement(node, isSVG), element);
    } else if (node.name && node.name === oldNode.name) {
      // 如果节点名称一致， 则更新dom

      // 根据新旧的props， 更新element节点
      updateElement(element, oldNode.props, node.props);

      var oldElements = [];
      var oldKeyed = {};
      var newKeyed = {};

      for (var i = 0; i < oldNode.children.length; i++) {
        oldElements[i] = element.childNodes[i];

        var oldChild = oldNode.children[i];
        var oldKey = getKey(oldChild);

        if (null != oldKey) {
          oldKeyed[oldKey] = [oldElements[i], oldChild];
        }
      }

      var i = 0;
      var j = 0;

      // 更新它下面的子节点
      while (j < node.children.length) {
        var oldChild = oldNode.children[i];
        var newChild = node.children[j];

        var oldKey = getKey(oldChild);
        var newKey = getKey(newChild);

        if (newKeyed[oldKey]) {
          i++;
          continue;
        }

        if (null == newKey) {
          if (null == oldKey) {
            patch(element, oldElements[i], oldChild, newChild, isSVG);
            j++;
          }
          i++;
        } else {
          var recyledNode = oldKeyed[newKey] || [];

          if (oldKey === newKey) {
            patch(element, recyledNode[0], recyledNode[1], newChild, isSVG);
            i++;
          } else if (recyledNode[0]) {
            patch(
              element,
              element.insertBefore(recyledNode[0], oldElements[i]),
              recyledNode[1],
              newChild,
              isSVG
            );
          } else {
            patch(element, oldElements[i], null, newChild, isSVG);
          }

          j++;
          newKeyed[newKey] = newChild;
        }
      }

      // 移除不存在的key
      while (i < oldNode.children.length) {
        var oldChild = oldNode.children[i];
        if (null == getKey(oldChild)) {
          removeElement(element, oldElements[i], oldChild);
        }
        i++;
      }

      for (var i in oldKeyed) {
        if (!newKeyed[oldKeyed[i][1].props.key]) {
          removeElement(element, oldKeyed[i][0], oldKeyed[i][1]);
        }
      }
    } else if (node.name === oldNode.name) {
      element.nodeValue = node;
    } else {
      element = parent.insertBefore(
        createElement(node, isSVG),
        (nextSibling = element)
      );
      removeElement(parent, nextSibling, oldNode);
    }
    return element;
  }
}
