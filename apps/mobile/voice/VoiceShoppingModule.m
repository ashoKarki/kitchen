#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

static NSString *const VoiceQueueKey = @"MyKitchenPendingVoiceItems";
static NSString *const VoiceQueueChanged = @"MyKitchenVoiceItemsChanged";

@interface VoiceShoppingModule : RCTEventEmitter <RCTBridgeModule>
@end

@implementation VoiceShoppingModule

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup { return YES; }
- (NSArray<NSString *> *)supportedEvents { return @[@"voiceShoppingChanged"]; }
- (void)startObserving {
  [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(queueChanged:) name:VoiceQueueChanged object:nil];
}
- (void)stopObserving { [[NSNotificationCenter defaultCenter] removeObserver:self name:VoiceQueueChanged object:nil]; }
- (void)queueChanged:(NSNotification *)notification {
  [self sendEventWithName:@"voiceShoppingChanged" body:nil];
}

RCT_REMAP_METHOD(nextItem, nextItemWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    NSArray *pending = [[NSUserDefaults standardUserDefaults] arrayForKey:VoiceQueueKey];
    resolve(pending.firstObject);
  });
}

RCT_REMAP_METHOD(claim, claim:(NSString *)identifier userId:(NSString *)userId kitchenId:(NSString *)kitchenId resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
    NSArray *stored = [defaults arrayForKey:VoiceQueueKey];
    id first = stored.firstObject;
    if (![first isKindOfClass:[NSDictionary class]] || ![first[@"id"] isKindOfClass:[NSString class]] ||
        ![first[@"id"] isEqualToString:identifier]) {
      reject(@"voice_queue_mismatch", @"The Siri shopping request is no longer at the front of the queue.", nil);
      return;
    }
    id owner = first[@"userId"];
    id household = first[@"kitchenId"];
    if ((owner != nil || household != nil) &&
        (![owner isKindOfClass:[NSString class]] || ![household isKindOfClass:[NSString class]] ||
         ![owner isEqualToString:userId] || ![household isEqualToString:kitchenId])) {
      reject(@"voice_queue_owner_mismatch", @"This Siri request belongs to a different account or household. Switch back to finish it.", nil);
      return;
    }
    NSMutableDictionary *claimed = [first mutableCopy];
    claimed[@"userId"] = userId;
    claimed[@"kitchenId"] = kitchenId;
    NSMutableArray *pending = [stored mutableCopy];
    pending[0] = claimed;
    [defaults setObject:pending forKey:VoiceQueueKey];
    resolve(nil);
  });
}

RCT_REMAP_METHOD(acknowledge, acknowledge:(NSString *)identifier resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
    NSArray *stored = [defaults arrayForKey:VoiceQueueKey];
    id first = stored.firstObject;
    if (![first isKindOfClass:[NSDictionary class]] || ![first[@"id"] isKindOfClass:[NSString class]] ||
        ![first[@"id"] isEqualToString:identifier]) {
      reject(@"voice_queue_mismatch", @"The Siri shopping request is no longer at the front of the queue.", nil);
      return;
    }
    NSMutableArray *pending = [stored mutableCopy];
    [pending removeObjectAtIndex:0];
    [defaults setObject:pending forKey:VoiceQueueKey];
    resolve(nil);
  });
}
@end
