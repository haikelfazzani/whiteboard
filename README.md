# React Draggable Component
A simple component for making elements draggable.

### [Demo](https://haikelfazzani.github.io/react-fabric/)
### [stackblitz](https://react-ts-qvltmc.stackblitz.io)

# Installation
```shell
$ npm install react-fabric
# yarn add react-fabric
```

# Example
```jsx
import { Draggable } from 'react-fabric';

<Draggable>
  <div>My element is draggable now</div>
</Draggable>
```

### Props
| name | type | default | description |
| --- | --- | --- | --- |
| children | `any` | empty | `Component or HTMLElement` |
| className | `string` | `'react-fabric'` | class name |
| style | `Object` | `{ position: 'fixed', left: '10px', top: '10px', zIndex: 99999 , cursor: 'move' }` | css style |

# License
MIT