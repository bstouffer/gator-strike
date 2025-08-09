
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface SpicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SpicyModal: React.FC<SpicyModalProps> = ({ isOpen, onClose }) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="hud-panel max-w-4xl w-full">
        <DialogHeader>
          <DialogTitle className="gator-header text-center">🌶️ SPICY MODE ACTIVATED 🌶️</DialogTitle>
        </DialogHeader>
        <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
          <video
            className="w-full h-full"
            controls
            autoPlay
            preload="metadata"
          >
            <source src="/lovable-uploads/spicy-video.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
        <div className="flex justify-center">
          <Button 
            variant="hud" 
            onClick={onClose}
            className="hud-button"
          >
            <X className="w-4 h-4 mr-2" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SpicyModal;
