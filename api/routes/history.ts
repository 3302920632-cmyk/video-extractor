import { Router } from 'express';
import { supabase } from '../server';

export const historyRouter = Router();

historyRouter.get('/', async (req, res) => {
  try {
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ success: false, message: '请提供用户ID' });
    }

    const { data, error } = await supabase
      .from('extraction_history')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('获取历史记录出错:', error);
    res.status(500).json({ success: false, message: '获取历史记录失败' });
  }
});

historyRouter.post('/', async (req, res) => {
  try {
    const { user_id, url, title, thumbnail, platform } = req.body;
    
    if (!user_id || !url) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }

    const { data, error } = await supabase
      .from('extraction_history')
      .insert({
        user_id,
        url,
        title,
        thumbnail,
        platform
      })
      .select();

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    res.json({ success: true, id: data?.[0]?.id });
  } catch (error) {
    console.error('保存历史记录出错:', error);
    res.status(500).json({ success: false, message: '保存历史记录失败' });
  }
});

historyRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from('extraction_history')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('删除历史记录出错:', error);
    res.status(500).json({ success: false, message: '删除历史记录失败' });
  }
});