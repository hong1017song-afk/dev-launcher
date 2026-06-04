import React from 'react';
import { Radio, Select } from 'antd';

const BrowserSelector: React.FC = () => {
  return (
    <Radio.Group>
      <Radio value="default">系统默认浏览器</Radio>
      <Radio value="specific">指定浏览器</Radio>
    </Radio.Group>
  );
};

export default BrowserSelector;
