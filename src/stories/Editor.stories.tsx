import React from 'react';
import { ComponentStory, ComponentMeta } from '@storybook/react';

import { Editor } from "../index";
import './Editor.css';

export default { title: 'Editor', component: Editor } as ComponentMeta<typeof Editor>;

export const C: ComponentStory<typeof Editor> = () => {
  return <Editor className='w-100 h-100 bg-dark container' />
}
