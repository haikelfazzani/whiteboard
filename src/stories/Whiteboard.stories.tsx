import React from 'react';
import { ComponentStory, ComponentMeta } from '@storybook/react';

import { Whiteboard } from "../index";
import './index.css';

export default { title: 'Whiteboard', component: Whiteboard } as ComponentMeta<typeof Whiteboard>;

export const C: ComponentStory<typeof Whiteboard> = () => {
  return <Whiteboard onChange={(v)=>{console.log(v);
  }} />
}
