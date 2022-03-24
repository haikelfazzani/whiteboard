import React from 'react';
import { ComponentStory, ComponentMeta } from '@storybook/react';

import { Whiteboard } from "../index";
import './Whiteboard.css';

export default { title: 'Whiteboard', component: Whiteboard } as ComponentMeta<typeof Whiteboard>;

export const C: ComponentStory<typeof Whiteboard> = () => {
  return <Whiteboard className='w-100 h-100 bg-dark container' />
}
